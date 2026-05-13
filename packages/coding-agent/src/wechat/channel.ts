/**
 * WeChat channel — attaches to an existing AgentSession to bridge
 * WeChat messages into the current OMP CLI session.
 *
 * When enabled via `omp --wechat`, the channel:
 *   - Long-polls WeChat for inbound messages → injects them via session.prompt()
 *   - Tracks which turns were WeChat-initiated via a reply queue
 *   - Subscribes to agent_end events → sends responses back to WeChat
 *
 * Unlike `WechatBot` (per-peer sessions) or `WechatBridge` (separate session),
 * this shares the SAME session as the terminal TUI.
 */

import { logger } from "@oh-my-pi/pi-utils";
import type { AgentSession, AgentSessionEvent } from "../session/agent-session";
import { type ResolvedWeixinAccount, resolveWeixinAccount, saveWeixinAccount } from "./account-store";
import { getUpdates, sendMessage } from "./api";
import { getContextToken, restoreContextTokens, setContextToken } from "./context-token-store";
import { StreamingMarkdownFilter } from "./markdown-filter";
import { MessageItemType, MessageState, MessageType, type WeixinMessage } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface WechatChannelOptions {
	/** Working directory (for context token storage) */
	cwd?: string;
	/** Specific account ID to use (default: most recent) */
	accountId?: string;
	/** AbortSignal to stop the channel */
	signal?: AbortSignal;
	/** Allow list of WeChat user IDs (empty = allow all) */
	allowUsers?: string[];
	/**
	 * Peer ID to sync CLI input/output to.
	 * When set, user messages typed in the terminal (not from WeChat) and
	 * the corresponding agent responses are forwarded to this WeChat peer.
	 * Use "self" to auto-sync to the most recent WeChat user who messaged the bot.
	 */
	syncPeerId?: string;
}

// ============================================================================
// Channel class
// ============================================================================

export class WechatChannel {
	#options: WechatChannelOptions;
	#session: AgentSession | null = null;
	#account: ResolvedWeixinAccount | null = null;
	#updateBuf = "";
	#running = false;
	/** Queue of peer IDs that have pending WeChat-initiated turns awaiting replies */
	#wxReplyQueue: string[] = [];
	#unsubscribe: (() => void) | null = null;
	/** Most recent WeChat user ID that messaged the bot (used for "self" sync) */
	#lastPeerId: string | undefined;

	constructor(options: WechatChannelOptions = {}) {
		this.#options = {
			allowUsers: [],
			...options,
		};
	}

	get isRunning(): boolean {
		return this.#running;
	}

	/** The last WeChat user ID that messaged this bot, or undefined if none. */
	get lastPeerId(): string | undefined {
		return this.#lastPeerId;
	}

	/** Resolve the effective sync peer, handling the "self" alias. */
	get #effectiveSyncPeerId(): string | undefined {
		const id = this.#options.syncPeerId;
		if (!id) return undefined;
		return id === "self" ? this.#lastPeerId : id;
	}
	/**
	 * Attach to an existing AgentSession and start polling WeChat.
	 * Call after the main OMP session is created.
	 */
	async attach(session: AgentSession): Promise<void> {
		if (this.#running) {
			logger.warn("WeChat channel is already attached");
			return;
		}

		this.#session = session;

		this.#account = await resolveWeixinAccount(this.#options.accountId);
		if (!this.#account) {
			throw new Error("No WeChat account available. Run `omp wechat login` first.");
		}

		// Use persisted syncPeerId from account as fallback
		if (!this.#options.syncPeerId && this.#account.syncPeerId) {
			this.#options.syncPeerId = this.#account.syncPeerId;
		}
		await restoreContextTokens(this.#account.accountId);

		this.#unsubscribe = session.subscribe((event: AgentSessionEvent) => {
			this.#handleAgentEvent(event);
		});

		this.#running = true;

		setActiveChannel(this);

		logger.debug("WeChat channel attached", {
			accountId: this.#account.accountId,
			userId: this.#account.userId,
		});

		this.#pollLoop().catch(err => {
			logger.error("WeChat channel poll loop crashed", { error: String(err) });
			this.#running = false;
		});
	}

	/** Detach from the session and stop polling */
	detach(): void {
		this.#running = false;
		this.#unsubscribe?.();
		this.#unsubscribe = null;
		logger.debug("WeChat channel detached");

		setActiveChannel(null);
	}

	// ============================================================================
	// Polling loop
	// ============================================================================

	async #pollLoop(): Promise<void> {
		const { signal } = this.#options;

		while (this.#running && !signal?.aborted) {
			try {
				const resp = await getUpdates({
					baseUrl: this.#account!.baseUrl,
					token: this.#account!.token,
					get_updates_buf: this.#updateBuf,
					signal,
				});

				if (resp.ret != null && resp.ret !== 0) {
					if (resp.errcode === -14) {
						logger.error("WeChat session expired. Re-login with `omp wechat login`.");
						this.detach();
						return;
					}
					logger.warn("WeChat getUpdates error", { ret: resp.ret, errcode: resp.errcode, errmsg: resp.errmsg });
					await Bun.sleep(2000);
					continue;
				}

				if (resp.get_updates_buf) {
					this.#updateBuf = resp.get_updates_buf;
				}

				if (resp.msgs?.length) {
					for (const msg of resp.msgs) {
						this.#handleInboundMessage(msg);
					}
				}
			} catch (err) {
				if (signal?.aborted || !this.#running) break;
				if (!(err instanceof Error && err.name === "AbortError")) {
					logger.error("WeChat channel poll error", { error: String(err) });
				}
				await Bun.sleep(5000);
			}
		}
	}

	// ============================================================================
	// Inbound message handling
	// ============================================================================

	#handleInboundMessage(msg: WeixinMessage): void {
		const fromUserId = msg.from_user_id;
		if (!fromUserId) return;

		const allowUsers = this.#options.allowUsers ?? [];
		if (allowUsers.length > 0 && !allowUsers.includes(fromUserId)) return;

		if (msg.context_token) {
			setContextToken(this.#account!.accountId, fromUserId, msg.context_token);
		}

		const textBody = extractTextBody(msg.item_list);
		if (!textBody) return;

		// Track the most recent peer for "self" sync resolution
		this.#lastPeerId = fromUserId;

		// Push to reply queue — this ties the next agent_end to this WeChat peer.
		// Agent turns are sequential, so queue order matches turn order.
		this.#wxReplyQueue.push(fromUserId);

		logger.debug("WeChat inbound", {
			from: fromUserId,
			textLen: textBody.length,
			msgId: msg.message_id,
			queueDepth: this.#wxReplyQueue.length,
		});

		// Fire-and-forget: prompt() queues the message into the session's turn
		// pipeline. The agent processes one turn at a time. Our reply queue
		// depth corresponds to how many pending turns were WeChat-initiated.
		this.#session?.prompt(textBody).catch(err => {
			logger.error("WeChat channel prompt error", { fromUserId, error: String(err) });
			// If the last entry in the queue is still this peer, pop it — the
			// prompt failed so no agent_end will come for it.
			if (this.#wxReplyQueue[this.#wxReplyQueue.length - 1] === fromUserId) {
				this.#wxReplyQueue.pop();
			}
			this.#sendWechatMessage(fromUserId, "抱歉，处理消息时出错，请稍后重试。").catch(() => {});
		});
	}

	// ============================================================================
	/**
	 * Update the sync peer ID at runtime.
	 * Pass undefined to disable syncing.
	 * Pass null to clear a previously stored value.
	 */
	async setSyncPeerId(peerId: string | undefined | null): Promise<void> {
		this.#options.syncPeerId = peerId ?? undefined;
		logger.debug("WeChat sync peer updated", { peerId });

		// Persist to account storage
		if (this.#account) {
			try {
				await saveWeixinAccount(this.#account.accountId, { syncPeerId: peerId ?? undefined });
			} catch (err) {
				logger.error("Failed to persist syncPeerId", { error: String(err) });
			}
		}
	}

	// ============================================================================
	// Agent event handling
	// ============================================================================

	#handleAgentEvent(event: AgentSessionEvent): void {
		// Forward CLI-originated user input to sync peer (if configured)
		if (event.type === "message_start" && event.message.role === "user") {
			const syncPeerId = this.#effectiveSyncPeerId;
			if (syncPeerId && this.#wxReplyQueue.length === 0) {
				const text = extractUserText(event.message);
				if (text) {
					this.#sendWechatMessage(syncPeerId, text).catch(err => {
						logger.error("Failed to sync CLI input to WeChat", { error: String(err) });
					});
				}
			}
			return;
		}

		if (event.type !== "agent_end") return;

		// WeChat-originated turn: send response back through the reply queue
		const peerId = this.#wxReplyQueue.shift();
		if (peerId) {
			if (!("messages" in event)) return;
			const messages = event.messages;
			const lastAssistant = findLastByRole(messages, "assistant");
			if (!lastAssistant) return;
			const fullText = extractAssistantText(lastAssistant);
			if (!fullText) return;
			const filtered = filterForWechat(fullText);
			this.#sendWechatMessage(peerId, filtered).catch(err => {
				logger.error("Failed to send WeChat response", { peerId, error: String(err) });
			});
			return;
		}

		// CLI-originated turn: forward to sync peer if configured
		const syncPeerId = this.#effectiveSyncPeerId;
		if (!syncPeerId) return;

		if (!("messages" in event)) return;
		const messages = event.messages;
		const lastAssistant = findLastByRole(messages, "assistant");
		if (!lastAssistant) return;
		const fullText = extractAssistantText(lastAssistant);
		if (!fullText) return;

		const filtered = filterForWechat(fullText);
		this.#sendWechatMessage(syncPeerId, filtered).catch(err => {
			logger.error("Failed to sync CLI output to WeChat", { error: String(err) });
		});
	}

	// ============================================================================
	// WeChat messaging
	// ============================================================================

	async #sendWechatMessage(toUserId: string, text: string): Promise<void> {
		if (!this.#account) return;

		const contextToken = getContextToken(this.#account.accountId, toUserId);

		try {
			const MAX_MESSAGE_LENGTH = 4000;
			const chunks = chunkText(text, MAX_MESSAGE_LENGTH);

			for (const chunk of chunks) {
				await sendMessage({
					baseUrl: this.#account.baseUrl,
					token: this.#account.token,
					body: {
						msg: {
							from_user_id: "",
							to_user_id: toUserId,
							client_id: `omp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
							message_type: MessageType.BOT,
							message_state: MessageState.FINISH,
							context_token: contextToken,
							item_list: [
								{
									type: MessageItemType.TEXT,
									text_item: { text: chunk },
								},
							],
						},
					},
				});
			}

			logger.debug("WeChat outbound message sent", { to: toUserId, textLen: text.length });
		} catch (err) {
			logger.error("WeChat send message error", { toUserId, error: String(err) });
		}
	}
}

// ============================================================================
// Module-level singleton — allows the slash command to reference
// the active channel created either via `omp --wechat` or `/wechat`.
// ============================================================================

let _activeChannel: WechatChannel | null = null;

/** Return the currently active WeChat channel, or null if none. */
export function getActiveChannel(): WechatChannel | null {
	return _activeChannel;
}

/** Set the active WeChat channel (internal — called by attach/detach and main.ts). */
export function setActiveChannel(channel: WechatChannel | null): void {
	if (_activeChannel && _activeChannel !== channel) {
		_activeChannel.detach();
	}
	_activeChannel = channel;
}

// ============================================================================
// Helpers
// ============================================================================

function extractTextBody(itemList?: WeixinMessage["item_list"]): string {
	if (!itemList?.length) return "";
	for (const item of itemList) {
		if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
			return String(item.text_item.text);
		}
	}
	return "";
}
/**
 * Extract concatenated text from a user message's content blocks.
 */
function extractUserText(message: { content: string | { type: string; text?: string }[] }): string {
	const textParts: string[] = [];
	if (typeof message.content === "string") return message.content;
	for (const block of message.content) {
		if (block.type === "text" && block.text) {
			textParts.push(block.text);
		}
	}
	return textParts.join("\n");
}

function filterForWechat(text: string): string {
	const f = new StreamingMarkdownFilter();
	return f.feed(text) + f.flush();
}

/**
 * Find the last message in the array with the given role.
 * `AgentMessage` can be a standard Message or a custom agent message type.
 */
function findLastByRole(
	messages: { role?: string }[],
	role: string,
): { role: "assistant"; content: { type: string }[] } | undefined {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === role) {
			return messages[i] as { role: "assistant"; content: { type: string }[] };
		}
	}
	return undefined;
}

/**
 * Extract concatenated text from an assistant message's content blocks.
 * Handles TextContent blocks only; skips thinking, tool calls, etc.
 */
function extractAssistantText(msg: { role: "assistant"; content: { type: string }[] }): string {
	const textParts: string[] = [];
	for (const block of msg.content) {
		if (block.type === "text" && "text" in block) {
			const text = (block as { type: "text"; text: string }).text;
			textParts.push(text);
		}
	}
	return textParts.join("\n");
}

function chunkText(text: string, maxLen: number): string[] {
	if (text.length <= maxLen) return [text];

	const chunks: string[] = [];
	const lines = text.split("\n");
	let current = "";
	for (const line of lines) {
		if (current.length + line.length + 1 > maxLen) {
			if (current) chunks.push(current);
			current = line;
		} else {
			current = current ? `${current}\n${line}` : line;
		}
	}
	if (current) chunks.push(current);
	return chunks;
}
