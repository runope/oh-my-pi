/**
 * WeChat-OMP bot runtime — bridges WeChat iLink messages with OMP agent sessions.
 *
 * Architecture:
 * - Long-polls WeChat for incoming messages via getUpdates API
 * - Routes each message to a per-peer OMP AgentSession
 * - Collects agent responses via event subscription
 * - Sends filtered (markdown-stripped) text back to WeChat
 * - Supports typing indicators and context tokens
 */

import { logger } from "@oh-my-pi/pi-utils";
import { type CreateAgentSessionResult, createAgentSession } from "../sdk";
import type { AgentSession, AgentSessionEvent } from "../session/agent-session";
import { type ResolvedWeixinAccount, resolveWeixinAccount } from "./account-store";
import { getConfig, getUpdates, sendMessage, sendTyping } from "./api";
import { getContextToken, restoreContextTokens, setContextToken } from "./context-token-store";
import { StreamingMarkdownFilter } from "./markdown-filter";
import { MessageItemType, MessageState, MessageType, TypingStatus, type WeixinMessage } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface WechatBotOptions {
	/** Working directory for OMP agent sessions */
	cwd?: string;
	/** Specific account ID to use (default: first available) */
	accountId?: string;
	/** AbortSignal to stop the bot */
	signal?: AbortSignal;
	/** Maximum concurrent agent sessions (default: 10) */
	maxSessions?: number;
	/** Session idle timeout in ms (default: 30 minutes) */
	sessionIdleTimeoutMs?: number;
	/** Whether to send typing indicators (default: true) */
	sendTypingIndicators?: boolean;
	/** Allow list of WeChat user IDs (empty = allow all) */
	allowUsers?: string[];
}

interface PeerSession {
	session: AgentSession;
	sessionResult: CreateAgentSessionResult;
	lastActivityAt: number;
	peerId: string;
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract text body from item_list */
export function extractTextBody(itemList?: WeixinMessage["item_list"]): string {
	if (!itemList?.length) return "";
	for (const item of itemList) {
		if (item.type === MessageItemType.TEXT && item.text_item?.text != null) {
			return String(item.text_item.text);
		}
	}
	return "";
}

/** Filter markdown for WeChat display */
function filterForWechat(text: string): string {
	const f = new StreamingMarkdownFilter();
	return f.feed(text) + f.flush();
}

/** Sleep with abort signal support */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise<void>(resolve => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				resolve();
			},
			{ once: true },
		);
	});
}

// ============================================================================
// Bot class
// ============================================================================

export class WechatBot {
	#options: WechatBotOptions;
	#account: ResolvedWeixinAccount | null = null;
	#peerSessions = new Map<string, PeerSession>();
	#updateBuf = "";
	#typingTicket: string | undefined;
	#running = false;
	#configCache: { ticket: string; fetchedAt: number } | null = null;

	// Bound listener references for cleanup
	#activeListeners = new Map<string, (event: AgentSessionEvent) => void>();

	constructor(options: WechatBotOptions = {}) {
		this.#options = {
			maxSessions: 10,
			sessionIdleTimeoutMs: 30 * 60 * 1000,
			sendTypingIndicators: true,
			allowUsers: [],
			...options,
		};
	}

	get isRunning(): boolean {
		return this.#running;
	}

	/** Start the bot: resolve account, restore context tokens, begin polling */
	async start(): Promise<void> {
		if (this.#running) {
			logger.warn("WeChat bot is already running");
			return;
		}

		// Resolve account
		this.#account = await resolveWeixinAccount(this.#options.accountId);
		if (!this.#account) {
			throw new Error("No WeChat account available. Run `omp wechat login` first.");
		}

		logger.debug("WeChat bot starting", {
			accountId: this.#account.accountId,
			userId: this.#account.userId,
		});

		console.log(`WeChat bot started for account ${this.#account.accountId}`);
		console.log(`Polling for messages at ${this.#account.baseUrl}...`);
		console.log("Press Ctrl+C to stop.");

		// Restore persisted context tokens
		await restoreContextTokens(this.#account.accountId);

		this.#running = true;

		// Start the polling loop
		await this.#pollLoop();
	}

	/** Stop the bot and clean up */
	async stop(): Promise<void> {
		this.#running = false;

		// Dispose all peer sessions
		for (const [peerId, peerSession] of this.#peerSessions) {
			try {
				await peerSession.session.dispose();
			} catch (err) {
				logger.warn("Failed to dispose peer session", { peerId, error: String(err) });
			}
		}
		this.#peerSessions.clear();

		// Clean up listeners
		this.#activeListeners.clear();

		logger.debug("WeChat bot stopped");
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
					const errcode = resp.errcode;
					// -14 = session timeout, need to re-login
					if (errcode === -14) {
						logger.error("WeChat session timeout, please re-login with `omp wechat login`");
						await this.stop();
						return;
					}

					logger.warn("WeChat getUpdates error", { ret: resp.ret, errcode, errmsg: resp.errmsg });
					await sleep(2000, signal);
					continue;
				}

				// Update cursor
				if (resp.get_updates_buf) {
					this.#updateBuf = resp.get_updates_buf;
				}

				// Process messages
				if (resp.msgs?.length) {
					for (const msg of resp.msgs) {
						await this.#processMessage(msg);
					}
				}
			} catch (err) {
				if (signal?.aborted) break;
				logger.error("WeChat poll error", { error: String(err) });
				await sleep(5000, signal);
			}
		}
	}

	// ============================================================================
	// Message processing
	// ============================================================================

	async #processMessage(msg: WeixinMessage): Promise<void> {
		const fromUserId = msg.from_user_id;
		if (!fromUserId) {
			logger.warn("WeChat message missing from_user_id, skipping");
			return;
		}

		// Check allow list
		const allowUsers = this.#options.allowUsers ?? [];
		if (allowUsers.length > 0 && !allowUsers.includes(fromUserId)) {
			logger.debug("WeChat message from unauthorized user, skipping", { fromUserId });
			return;
		}

		// Store context token
		if (msg.context_token) {
			setContextToken(this.#account!.accountId, fromUserId, msg.context_token);
		}

		const textBody = extractTextBody(msg.item_list);
		if (!textBody) {
			logger.debug("WeChat message has no text body, skipping", { fromUserId });
			return;
		}

		logger.debug("WeChat inbound message", {
			from: fromUserId,
			textLen: textBody.length,
			msgId: msg.message_id,
		});

		// Get or create peer session
		const peerSession = await this.#getOrCreatePeerSession(fromUserId);

		// Send typing indicator
		if (this.#options.sendTypingIndicators) {
			await this.#sendTypingStart(fromUserId);
		}

		try {
			// Send the message to OMP agent
			await peerSession.session.prompt(textBody);
		} catch (err) {
			logger.error("WeChat agent prompt error", { fromUserId, error: String(err) });
			await this.#sendWechatMessage(fromUserId, "抱歉，处理消息时出错，请稍后重试。");
		} finally {
			// Cancel typing
			if (this.#options.sendTypingIndicators) {
				await this.#sendTypingStop(fromUserId);
			}
		}
	}

	// ============================================================================
	// Peer session management
	// ============================================================================

	async #getOrCreatePeerSession(peerId: string): Promise<PeerSession> {
		const existing = this.#peerSessions.get(peerId);
		if (existing) {
			existing.lastActivityAt = Date.now();
			return existing;
		}

		// Evict oldest idle session if at capacity
		if (this.#peerSessions.size >= (this.#options.maxSessions ?? 10)) {
			let oldestKey: string | null = null;
			let oldestTime = Infinity;
			for (const [key, session] of this.#peerSessions) {
				if (session.lastActivityAt < oldestTime) {
					oldestTime = session.lastActivityAt;
					oldestKey = key;
				}
			}
			if (oldestKey) {
				const evicted = this.#peerSessions.get(oldestKey);
				if (evicted) {
					try {
						await evicted.session.dispose();
					} catch (err) {
						logger.warn("Failed to dispose evicted session", { peerId: oldestKey, error: String(err) });
					}
					this.#peerSessions.delete(oldestKey);
				}
			}
		}

		// Create new session
		logger.debug("Creating new OMP agent session for WeChat peer", { peerId });

		const sessionResult = await createAgentSession({
			cwd: this.#options.cwd,
			hasUI: false,
			providerSessionId: `wechat-${peerId}`,
		});

		const session = sessionResult.session;

		// Subscribe to events for response collection
		const listener = (event: AgentSessionEvent) => {
			this.#handleAgentEvent(peerId, event);
		};
		session.subscribe(listener);
		this.#activeListeners.set(peerId, listener);

		const peerSession: PeerSession = {
			session,
			sessionResult,
			lastActivityAt: Date.now(),
			peerId,
		};

		this.#peerSessions.set(peerId, peerSession);
		return peerSession;
	}

	// ============================================================================
	// Agent event handling
	// ============================================================================

	#handleAgentEvent(peerId: string, event: AgentSessionEvent): void {
		// We only care about agent_end events for sending responses
		// The prompt() call is awaited, so the response is already complete
		// by the time we get agent_end. We extract the response from session state.
		if (event.type === "agent_end") {
			const peerSession = this.#peerSessions.get(peerId);
			if (!peerSession) return;

			const state = peerSession.session.state;
			const messages = state.messages;
			const lastMessage = messages[messages.length - 1];

			if (lastMessage?.role === "assistant") {
				const textParts: string[] = [];
				for (const content of lastMessage.content) {
					if (content.type === "text" && content.text) {
						textParts.push(content.text);
					}
				}

				const fullText = textParts.join("\n");
				if (fullText) {
					const filtered = filterForWechat(fullText);
					this.#sendWechatMessage(peerId, filtered).catch(err => {
						logger.error("Failed to send WeChat response", { peerId, error: String(err) });
					});
				}
			}
		}
	}

	// ============================================================================
	// WeChat messaging
	// ============================================================================

	async #sendWechatMessage(toUserId: string, text: string): Promise<void> {
		if (!this.#account) return;

		const contextToken = getContextToken(this.#account.accountId, toUserId);

		try {
			// Split long messages (WeChat has message length limits)
			const MAX_MESSAGE_LENGTH = 4000;
			const chunks: string[] = [];

			if (text.length <= MAX_MESSAGE_LENGTH) {
				chunks.push(text);
			} else {
				// Split by newlines first, then by length
				const lines = text.split("\n");
				let current = "";
				for (const line of lines) {
					if (current.length + line.length + 1 > MAX_MESSAGE_LENGTH) {
						if (current) chunks.push(current);
						current = line;
					} else {
						current = current ? `${current}\n${line}` : line;
					}
				}
				if (current) chunks.push(current);
			}

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

	// ============================================================================
	// Typing indicators
	// ============================================================================

	async #fetchTypingTicket(): Promise<string | undefined> {
		if (!this.#account) return undefined;

		// Cache for 5 minutes
		if (this.#configCache && Date.now() - this.#configCache.fetchedAt < 5 * 60_000) {
			return this.#configCache.ticket || this.#typingTicket;
		}

		try {
			const resp = await getConfig({
				baseUrl: this.#account.baseUrl,
				token: this.#account.token,
				ilinkUserId: this.#account.userId ?? "",
			});

			if (resp.ret === 0 && resp.typing_ticket) {
				this.#configCache = {
					ticket: resp.typing_ticket,
					fetchedAt: Date.now(),
				};
				this.#typingTicket = resp.typing_ticket;
				return resp.typing_ticket;
			}
		} catch (err) {
			logger.debug("Failed to fetch typing ticket", { error: String(err) });
		}

		return this.#typingTicket;
	}

	async #sendTypingStart(toUserId: string): Promise<void> {
		const ticket = await this.#fetchTypingTicket();
		if (!ticket || !this.#account) return;

		try {
			await sendTyping({
				baseUrl: this.#account.baseUrl,
				token: this.#account.token,
				body: {
					ilink_user_id: toUserId,
					typing_ticket: ticket,
					status: TypingStatus.TYPING,
				},
			});
		} catch (err) {
			logger.debug("Typing start error (non-critical)", { error: String(err) });
		}
	}

	async #sendTypingStop(toUserId: string): Promise<void> {
		const ticket = await this.#fetchTypingTicket();
		if (!ticket || !this.#account) return;

		try {
			await sendTyping({
				baseUrl: this.#account.baseUrl,
				token: this.#account.token,
				body: {
					ilink_user_id: toUserId,
					typing_ticket: ticket,
					status: TypingStatus.CANCEL,
				},
			});
		} catch (err) {
			logger.debug("Typing stop error (non-critical)", { error: String(err) });
		}
	}
}
