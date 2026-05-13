/**
 * WeChat-OMP bridge — interactive terminal chat backed by OMP agent.
 *
 * Unlike `WechatBot` (headless, per-peer sessions), the bridge creates
 * a single shared OMP AgentSession and connects it to both:
 *   - WeChat inbound messages (via long-poll)
 *   - Terminal stdin (interactive input)
 *
 * All messages and responses are displayed in the terminal with timestamps.
 * Agent responses are also sent back to WeChat.
 *
 * Usage: omp wechat bridge
 */

import * as readline from "node:readline";
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

export interface WechatBridgeOptions {
	/** Working directory for OMP agent session */
	cwd?: string;
	/** Specific account ID to use (default: most recent) */
	accountId?: string;
	/** AbortSignal to stop the bridge */
	signal?: AbortSignal;
	/** Whether to send typing indicators (default: true) */
	sendTypingIndicators?: boolean;
	/** Allow list of WeChat user IDs (empty = allow all) */
	allowUsers?: string[];
}

// ============================================================================
// Formatting helpers
// ============================================================================

function ts(): string {
	return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function formatInbound(from: string, text: string): string {
	const display = text.length > 200 ? `${text.substring(0, 200)}...` : text;
	return `\x1b[36m[${ts()}] \x1b[1m[WX ${shortenPeerId(from)}]\x1b[0m ${display}`;
}

function formatOutbound(text: string): string {
	const display = text.length > 300 ? `${text.substring(0, 300)}...` : text;
	return `\x1b[32m[${ts()}] \x1b[1m[AI]\x1b[0m ${display}`;
}

function formatSystem(text: string): string {
	return `\x1b[33m[${ts()}] [SYS] ${text}\x1b[0m`;
}

function shortenPeerId(peerId: string): string {
	if (peerId.length > 20) {
		return `${peerId.substring(0, 8)}..${peerId.substring(peerId.length - 8)}`;
	}
	return peerId;
}

// ============================================================================
// Bridge class
// ============================================================================

export class WechatBridge {
	#options: WechatBridgeOptions;
	#account: ResolvedWeixinAccount | null = null;
	#session: AgentSession | null = null;
	#sessionResult: CreateAgentSessionResult | null = null;
	#updateBuf = "";
	#running = false;
	#typingTicket: string | undefined;
	#configCache: { ticket: string; fetchedAt: number } | null = null;
	#currentPeerId: string | undefined;
	#rl: readline.Interface | null = null;

	constructor(options: WechatBridgeOptions = {}) {
		this.#options = {
			sendTypingIndicators: true,
			allowUsers: [],
			...options,
		};
	}

	get isRunning(): boolean {
		return this.#running;
	}

	/** Start the bridge: resolve account, create session, begin polling + stdin */
	async start(): Promise<void> {
		if (this.#running) {
			logger.warn("WeChat bridge is already running");
			return;
		}

		// Resolve account
		this.#account = await resolveWeixinAccount(this.#options.accountId);
		if (!this.#account) {
			throw new Error("No WeChat account available. Run `omp wechat login` first.");
		}

		logger.debug("WeChat bridge starting", {
			accountId: this.#account.accountId,
			userId: this.#account.userId,
		});

		// Restore context tokens
		await restoreContextTokens(this.#account.accountId);

		// Create shared OMP agent session
		logger.debug("Creating shared OMP agent session for WeChat bridge");
		this.#sessionResult = await createAgentSession({
			cwd: this.#options.cwd,
			hasUI: false,
			providerSessionId: `wechat-bridge-${this.#account.accountId}`,
		});
		this.#session = this.#sessionResult.session;

		// Subscribe to agent events for response collection
		this.#session.subscribe((event: AgentSessionEvent) => {
			this.#handleAgentEvent(event);
		});

		this.#running = true;

		// Print banner
		this.#print(formatSystem(`WeChat bridge started for ${this.#account.accountId}`));
		this.#print(formatSystem("WeChat messages will appear here. Type to send to the agent."));
		this.#print(formatSystem("Commands: /send <text>  /status  /quit"));
		this.#print("");

		// Start stdin reader and poll loop concurrently
		const stdinPromise = this.#startStdinReader();
		const pollPromise = this.#pollLoop();

		// Wait for either to finish (abort signal cancels both)
		try {
			await Promise.race([stdinPromise, pollPromise]);
		} finally {
			await this.stop();
		}
	}

	/** Stop the bridge and clean up */
	async stop(): Promise<void> {
		if (!this.#running) return;
		this.#running = false;

		// Close stdin reader
		this.#rl?.close();
		this.#rl = null;

		// Dispose session
		if (this.#session) {
			try {
				await this.#session.dispose();
			} catch (err) {
				logger.warn("Failed to dispose bridge session", { error: String(err) });
			}
		}
		this.#session = null;
		this.#sessionResult = null;

		logger.debug("WeChat bridge stopped");
	}

	// ============================================================================
	// Terminal I/O
	// ============================================================================

	/** Print a line to stdout (respects the readline interface) */
	#print(line: string): void {
		if (this.#rl) {
			this.#rl.write(null, { ctrl: true, name: "u" }); // clear current input
			process.stdout.write(`${line}\n`);
			this.#rl.prompt(true); // re-display the prompt
		} else {
			process.stdout.write(`${line}\n`);
		}
	}

	/** Start reading from stdin for interactive commands */
	async #startStdinReader(): Promise<void> {
		return new Promise<void>(resolve => {
			this.#rl = readline.createInterface({
				input: process.stdin,
				output: process.stdout,
				prompt: "\x1b[35m[you]\x1b[0m ",
			});

			this.#rl.prompt();

			this.#rl.on("line", async (line: string) => {
				const trimmed = line.trim();
				if (!trimmed) {
					this.#rl?.prompt();
					return;
				}

				// Built-in commands
				if (trimmed === "/quit" || trimmed === "/exit") {
					this.#print(formatSystem("Shutting down bridge..."));
					this.#running = false;
					resolve();
					return;
				}

				if (trimmed === "/status") {
					const peerInfo = this.#currentPeerId
						? `Last peer: ${shortenPeerId(this.#currentPeerId)}`
						: "No messages yet";
					const msgCount = this.#session?.state.messages.length ?? 0;
					this.#print(formatSystem(`${peerInfo} | Session messages: ${msgCount}`));
					this.#rl?.prompt();
					return;
				}

				// /send <text> — send directly to WeChat peer without agent
				if (trimmed.startsWith("/send ")) {
					const text = trimmed.substring(6).trim();
					if (text && this.#currentPeerId) {
						await this.#sendWechatMessage(this.#currentPeerId, text);
						this.#print(formatSystem(`Sent to ${shortenPeerId(this.#currentPeerId)}: ${text}`));
					} else if (!this.#currentPeerId) {
						this.#print(formatSystem("No WeChat peer yet — wait for a message first."));
					}
					this.#rl?.prompt();
					return;
				}

				// All other input → send to the OMP agent
				if (this.#session) {
					try {
						this.#print(formatSystem("Processing..."));
						await this.#session.prompt(trimmed);
					} catch (err) {
						this.#print(formatSystem(`Agent error: ${err instanceof Error ? err.message : String(err)}`));
					}
				}
				this.#rl?.prompt();
			});

			this.#rl.on("close", () => {
				this.#running = false;
				resolve();
			});

			// Also stop on signal
			const { signal } = this.#options;
			if (signal) {
				signal.addEventListener(
					"abort",
					() => {
						this.#rl?.close();
						this.#running = false;
						resolve();
					},
					{ once: true },
				);
			}
		});
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
					if (errcode === -14) {
						this.#print(formatSystem("WeChat session expired. Please re-login with `omp wechat login`."));
						await this.stop();
						return;
					}

					logger.warn("WeChat getUpdates error", { ret: resp.ret, errcode, errmsg: resp.errmsg });
					await Bun.sleep(2000);
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
				if (signal?.aborted || !this.#running) break;

				// Long-poll timeout is normal — getUpdates handles AbortError internally
				// Only log real errors
				if (!(err instanceof Error && err.name === "AbortError")) {
					logger.error("WeChat poll error", { error: String(err) });
				}
				await Bun.sleep(5000);
			}
		}
	}

	// ============================================================================
	// Message processing
	// ============================================================================

	async #processMessage(msg: WeixinMessage): Promise<void> {
		const fromUserId = msg.from_user_id;
		if (!fromUserId) return;

		// Check allow list
		const allowUsers = this.#options.allowUsers ?? [];
		if (allowUsers.length > 0 && !allowUsers.includes(fromUserId)) return;

		// Store context token
		if (msg.context_token) {
			setContextToken(this.#account!.accountId, fromUserId, msg.context_token);
		}

		const textBody = extractTextBody(msg.item_list);
		if (!textBody) return;

		// Remember the current peer for /send command
		this.#currentPeerId = fromUserId;

		// Display in terminal
		this.#print(formatInbound(fromUserId, textBody));

		// Send typing indicator
		if (this.#options.sendTypingIndicators) {
			await this.#sendTypingStart(fromUserId);
		}

		try {
			// Send to OMP agent
			await this.#session?.prompt(textBody);
		} catch (err) {
			logger.error("Bridge agent prompt error", { fromUserId, error: String(err) });
			await this.#sendWechatMessage(fromUserId, "抱歉，处理消息时出错，请稍后重试。");
		} finally {
			if (this.#options.sendTypingIndicators) {
				await this.#sendTypingStop(fromUserId);
			}
		}
	}

	// ============================================================================
	// Agent event handling
	// ============================================================================

	#handleAgentEvent(event: AgentSessionEvent): void {
		if (event.type !== "agent_end") return;

		const state = this.#session?.state;
		if (!state) return;

		const messages = state.messages;
		const lastMessage = messages[messages.length - 1];
		if (lastMessage?.role !== "assistant") return;

		const textParts: string[] = [];
		for (const content of lastMessage.content) {
			if (content.type === "text" && content.text) {
				textParts.push(content.text);
			}
		}

		const fullText = textParts.join("\n");
		if (!fullText) return;

		const filtered = filterForWechat(fullText);

		// Display in terminal
		this.#print(formatOutbound(filtered));

		// Send to WeChat peer
		const peerId = this.#currentPeerId;
		if (peerId) {
			this.#sendWechatMessage(peerId, filtered).catch(err => {
				logger.error("Failed to send WeChat response", { peerId, error: String(err) });
			});
		}
	}

	// ============================================================================
	// WeChat messaging
	// ============================================================================

	async #sendWechatMessage(toUserId: string, text: string): Promise<void> {
		if (!this.#account) return;

		const contextToken = getContextToken(this.#account.accountId, toUserId);

		try {
			const MAX_MESSAGE_LENGTH = 4000;
			const chunks: string[] = [];

			if (text.length <= MAX_MESSAGE_LENGTH) {
				chunks.push(text);
			} else {
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

// ============================================================================
// Shared helpers (same as bot.ts)
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

function filterForWechat(text: string): string {
	const f = new StreamingMarkdownFilter();
	return f.feed(text) + f.flush();
}
