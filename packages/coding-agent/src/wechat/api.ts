/**
 * WeChat iLink API client — HTTP JSON over POST.
 *
 * Ported from @tencent-weixin/openclaw-weixin/src/api/api.ts with OMP standalone integration.
 * No OpenClaw dependency; uses native fetch.
 *
 * All endpoint paths use the `ilink/bot/` prefix per the iLink Bot protocol:
 *   POST {baseUrl}/ilink/bot/getupdates
 *   POST {baseUrl}/ilink/bot/sendmessage
 *   POST {baseUrl}/ilink/bot/getconfig
 *   POST {baseUrl}/ilink/bot/sendtyping
 *   POST {baseUrl}/ilink/bot/getuploadurl
 */

import { logger } from "@oh-my-pi/pi-utils";
import type {
	BaseInfo,
	GetConfigResp,
	GetUpdatesReq,
	GetUpdatesResp,
	GetUploadUrlReq,
	GetUploadUrlResp,
	SendMessageReq,
	SendMessageResp,
	SendTypingReq,
	SendTypingResp,
} from "./types";

// ============================================================================
// Options
// ============================================================================

export interface WeixinApiOptions {
	baseUrl: string;
	token?: string;
	/** AbortSignal for request cancellation */
	signal?: AbortSignal;
}

// ============================================================================
// Constants
// ============================================================================

const CHANNEL_VERSION = "2.0.0-omp";

/** iLink-App-Id */
const ILINK_APP_ID = "bot";

/** Default timeout for long-poll getUpdates requests */
const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000;
/** Default timeout for regular API requests (sendMessage, getUploadUrl) */
const DEFAULT_API_TIMEOUT_MS = 15_000;
/** Default timeout for lightweight API requests (getConfig, sendTyping) */
const DEFAULT_CONFIG_TIMEOUT_MS = 10_000;

function ensureTrailingSlash(url: string): string {
	return url.endsWith("/") ? url : `${url}/`;
}

/** X-WECHAT-UIN header: random uint32 → decimal string → base64 */
function randomWechatUin(): string {
	const uint32 = Math.floor(Math.random() * 0xffffffff) >>> 0;
	return Buffer.from(uint32.toString()).toString("base64");
}

/** Build headers shared by all requests */
function buildCommonHeaders(): Record<string, string> {
	return {
		"Content-Type": "application/json",
		"iLink-App-Id": ILINK_APP_ID,
		"X-WECHAT-UIN": randomWechatUin(),
	};
}

/** Build headers for POST requests with auth */
function buildHeaders(opts: { token?: string; body: string }): Record<string, string> {
	const headers = buildCommonHeaders();

	if (opts.token) {
		headers.AuthorizationType = "ilink_bot_token";
		headers.Authorization = `Bearer ${opts.token}`;
	}

	// Set content-length explicitly for some proxy compatibility
	headers["Content-Length"] = Buffer.byteLength(opts.body).toString();

	return headers;
}

// ============================================================================
// HTTP helpers
// ============================================================================

async function apiPostFetch(params: {
	baseUrl: string;
	path: string;
	body: string;
	token?: string;
	timeoutMs: number;
	signal?: AbortSignal;
}): Promise<string> {
	const url = `${ensureTrailingSlash(params.baseUrl)}${params.path}`;
	const headers = buildHeaders({ token: params.token, body: params.body });

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs);

	// Link external signal
	if (params.signal) {
		params.signal.addEventListener("abort", () => controller.abort(), { once: true });
	}

	try {
		const response = await fetch(url, {
			method: "POST",
			headers,
			body: params.body,
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`WeChat API HTTP ${response.status}: ${response.statusText} [${params.path}]`);
		}

		return await response.text();
	} finally {
		clearTimeout(timeoutId);
	}
}

// ============================================================================
// Build base_info
// ============================================================================

export function buildBaseInfo(): BaseInfo {
	return { channel_version: CHANNEL_VERSION };
}

// ============================================================================
// API methods
// ============================================================================

/**
 * Long-poll getUpdates. Server holds the request until new messages or timeout.
 */
export async function getUpdates(params: GetUpdatesReq & WeixinApiOptions): Promise<GetUpdatesResp> {
	const body = JSON.stringify({
		base_info: params.base_info ?? buildBaseInfo(),
		get_updates_buf: params.get_updates_buf ?? "",
	});

	try {
		const text = await apiPostFetch({
			baseUrl: params.baseUrl,
			path: "ilink/bot/getupdates",
			body,
			token: params.token,
			timeoutMs: DEFAULT_LONG_POLL_TIMEOUT_MS + 10_000,
			signal: params.signal,
		});

		const resp: GetUpdatesResp = JSON.parse(text);

		if (resp.ret != null && resp.ret !== 0) {
			logger.warn("WeChat getUpdates error", {
				ret: resp.ret,
				errcode: resp.errcode,
				errmsg: resp.errmsg,
			});
		}

		return resp;
	} catch (err) {
		// Long-poll client-side timeout is normal — return empty response so caller can retry
		if (err instanceof Error && err.name === "AbortError") {
			return { ret: 0, msgs: [], get_updates_buf: params.get_updates_buf };
		}
		throw err;
	}
}

/** Get a pre-signed CDN upload URL for a file. */
export async function getUploadUrl(params: GetUploadUrlReq & WeixinApiOptions): Promise<GetUploadUrlResp> {
	const body = JSON.stringify({
		...params,
		base_info: params.base_info ?? buildBaseInfo(),
	});

	const text = await apiPostFetch({
		baseUrl: params.baseUrl,
		path: "ilink/bot/getuploadurl",
		body,
		token: params.token,
		timeoutMs: DEFAULT_API_TIMEOUT_MS,
		signal: params.signal,
	});

	return JSON.parse(text) as GetUploadUrlResp;
}

/** Send a single message downstream. */
export async function sendMessage(params: WeixinApiOptions & { body: SendMessageReq }): Promise<SendMessageResp> {
	const body = JSON.stringify({
		...params.body,
		base_info: params.body.base_info ?? buildBaseInfo(),
	});

	const text = await apiPostFetch({
		baseUrl: params.baseUrl,
		path: "ilink/bot/sendmessage",
		body,
		token: params.token,
		timeoutMs: DEFAULT_API_TIMEOUT_MS,
		signal: params.signal,
	});

	return JSON.parse(text) as SendMessageResp;
}

/** Fetch bot config (includes typing_ticket) for a given user. */
export async function getConfig(
	params: WeixinApiOptions & { ilinkUserId: string; contextToken?: string },
): Promise<GetConfigResp> {
	const body = JSON.stringify({
		base_info: buildBaseInfo(),
		ilink_user_id: params.ilinkUserId,
		context_token: params.contextToken,
	});

	const text = await apiPostFetch({
		baseUrl: params.baseUrl,
		path: "ilink/bot/getconfig",
		body,
		token: params.token,
		timeoutMs: DEFAULT_CONFIG_TIMEOUT_MS,
		signal: params.signal,
	});

	return JSON.parse(text) as GetConfigResp;
}

/** Send a typing indicator to a user. */
export async function sendTyping(params: WeixinApiOptions & { body: SendTypingReq }): Promise<SendTypingResp> {
	const body = JSON.stringify({
		...params.body,
		base_info: params.body.base_info ?? buildBaseInfo(),
	});

	const text = await apiPostFetch({
		baseUrl: params.baseUrl,
		path: "ilink/bot/sendtyping",
		body,
		token: params.token,
		timeoutMs: DEFAULT_CONFIG_TIMEOUT_MS,
		signal: params.signal,
	});

	return JSON.parse(text) as SendTypingResp;
}
