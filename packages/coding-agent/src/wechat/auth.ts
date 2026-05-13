/**
 * WeChat QR code authentication — login flow.
 *
 * Ported from @tencent-weixin/openclaw-weixin/src/auth/login-qr.ts
 * with OMP-specific terminal rendering.
 *
 * QR login uses GET requests to the iLink bot API:
 *   GET /ilink/bot/get_bot_qrcode?bot_type=3
 *   GET /ilink/bot/get_qrcode_status?qrcode=...
 */

import { randomUUID } from "node:crypto";
import { logger } from "@oh-my-pi/pi-utils";
import { saveWeixinAccount } from "./account-store";
import type { QRCodeResponse, QRStatusResponse } from "./types";

// ============================================================================
// Constants
// ============================================================================

/** Fixed API base URL for QR code requests */
const FIXED_BASE_URL = "https://ilinkai.weixin.qq.com";

/** Default bot_type for ilink get_bot_qrcode */
const DEFAULT_ILINK_BOT_TYPE = "3";

/** Client-side timeout for the long-poll get_qrcode_status request */
const QR_LONG_POLL_TIMEOUT_MS = 35_000;

/** How long a login session is considered fresh */
const ACTIVE_LOGIN_TTL_MS = 5 * 60_000;

/** Max QR refresh count before requiring a new login */
const MAX_QR_REFRESH_COUNT = 3;

// ============================================================================
// Internal types
// ============================================================================

interface ActiveLogin {
	qrcode: string;
	qrcodeUrl: string;
	startedAt: number;
	/** Current polling base URL; may be updated on IDC redirect */
	currentApiBaseUrl: string;
}

const activeLogins = new Map<string, ActiveLogin>();

function isLoginFresh(login: ActiveLogin): boolean {
	return Date.now() - login.startedAt < ACTIVE_LOGIN_TTL_MS;
}

function purgeExpiredLogins(): void {
	for (const [key, login] of activeLogins) {
		if (!isLoginFresh(login)) {
			activeLogins.delete(key);
		}
	}
}

// ============================================================================
// QR code API calls
// ============================================================================

async function fetchQRCode(apiBaseUrl: string, botType: string): Promise<QRCodeResponse> {
	const url = `${apiBaseUrl}/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`;

	const response = await fetch(url, {
		method: "GET",
		headers: { "Content-Type": "application/json" },
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch QR code: HTTP ${response.status}`);
	}

	return (await response.json()) as QRCodeResponse;
}

async function pollQRStatus(apiBaseUrl: string, qrcode: string): Promise<QRStatusResponse> {
	const url = `${apiBaseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), QR_LONG_POLL_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new Error(`Failed to poll QR status: HTTP ${response.status}`);
		}

		return (await response.json()) as QRStatusResponse;
	} catch (err) {
		// Timeout or network error — treat as "wait" to keep polling
		if (err instanceof Error && err.name === "AbortError") {
			return { status: "wait" };
		}
		logger.warn("QR poll network error, will retry", { error: String(err) });
		return { status: "wait" };
	} finally {
		clearTimeout(timeoutId);
	}
}

// ============================================================================
// QR rendering
// ============================================================================

/**
 * Render a QR code for the user to scan.
 * Uses qrcode-terminal for ASCII art if available, falls back to URL.
 */
async function renderQRCode(qrcodeUrl: string, qrcodeData: string): Promise<void> {
	// Try rendering ASCII QR code in terminal
	if (qrcodeUrl) {
		try {
			// @ts-expect-error -- qrcode-terminal has no bundled types; declaration in bun-imports.d.ts
			const qrcodeTerminal = await import("qrcode-terminal");
			qrcodeTerminal.default.generate(qrcodeUrl, { small: true });
			console.log("If the QR code is not visible, open this URL in a browser:");
			console.log(qrcodeUrl);
		} catch {
			console.log("Scan this QR code URL with WeChat:");
			console.log(qrcodeUrl);
		}
	}
	// Also show a fallback link
	console.log(`Fallback: https://login.weixin.qq.com/l/${qrcodeData}`);
}

// ============================================================================
// Public API
// ============================================================================

export interface WeixinQrStartResult {
	loginId: string;
	qrcode: string;
	qrcodeUrl: string;
}

export type WeixinQrWaitResult =
	| { success: true; token: string; baseUrl: string; userId: string; accountId: string }
	| { success: false; reason: "expired" | "cancelled" | "error"; error?: string };

/**
 * Start a QR code login session. Displays QR code in terminal.
 */
export async function startWeixinLogin(): Promise<WeixinQrStartResult> {
	purgeExpiredLogins();

	const qrResp = await fetchQRCode(FIXED_BASE_URL, DEFAULT_ILINK_BOT_TYPE);

	if (!qrResp.qrcode) {
		throw new Error("Failed to get QR code from WeChat iLink API");
	}

	const loginId = randomUUID();
	activeLogins.set(loginId, {
		qrcode: qrResp.qrcode,
		qrcodeUrl: qrResp.qrcode_img_content ?? "",
		startedAt: Date.now(),
		currentApiBaseUrl: FIXED_BASE_URL,
	});

	// Display QR code
	logger.debug("QR code received, displaying for scan...");
	await renderQRCode(qrResp.qrcode_img_content ?? "", qrResp.qrcode);
	logger.debug("Waiting for scan...");

	return {
		loginId,
		qrcode: qrResp.qrcode,
		qrcodeUrl: qrResp.qrcode_img_content ?? "",
	};
}

/**
 * Wait for the QR code to be scanned and confirmed.
 * Polls until confirmed, expired, or cancelled.
 */
export async function waitForWeixinLogin(loginId: string, signal?: AbortSignal): Promise<WeixinQrWaitResult> {
	const login = activeLogins.get(loginId);
	if (!login || !isLoginFresh(login)) {
		activeLogins.delete(loginId);
		return { success: false, reason: "expired", error: "Login session expired" };
	}

	let refreshCount = 0;

	while (true) {
		if (signal?.aborted) {
			activeLogins.delete(loginId);
			return { success: false, reason: "cancelled", error: "Login cancelled by user" };
		}

		try {
			const currentBaseUrl = login.currentApiBaseUrl;
			const statusResp = await pollQRStatus(currentBaseUrl, login.qrcode);

			switch (statusResp.status) {
				case "wait":
					// Still waiting for scan
					break;

				case "scaned":
					logger.debug("QR code scanned! Please confirm on your phone...");
					break;

				case "scaned_but_redirect": {
					// IDC redirect — switch to the new host
					if (statusResp.redirect_host) {
						login.currentApiBaseUrl = `https://${statusResp.redirect_host}`;
						logger.debug("IDC redirect, switching polling host", { host: statusResp.redirect_host });
					}
					break;
				}

				case "confirmed": {
					const token = statusResp.bot_token;
					const baseUrl = statusResp.baseurl ?? FIXED_BASE_URL;
					const userId = statusResp.ilink_user_id ?? "";
					const botId = statusResp.ilink_bot_id;

					if (!token || !botId) {
						return {
							success: false,
							reason: "error",
							error: "Login confirmed but missing bot_token or ilink_bot_id",
						};
					}

					// Use ilink_bot_id as the account ID
					const accountId = botId;

					// Save credentials
					await saveWeixinAccount(accountId, {
						token,
						baseUrl,
						userId,
					});

					activeLogins.delete(loginId);
					logger.debug(`WeChat login successful! Account: ${accountId}`);

					return {
						success: true,
						token,
						baseUrl,
						userId,
						accountId,
					};
				}

				case "expired": {
					refreshCount++;
					if (refreshCount >= MAX_QR_REFRESH_COUNT) {
						activeLogins.delete(loginId);
						return { success: false, reason: "expired", error: "QR code expired after max refreshes" };
					}

					// Refresh QR code
					logger.debug("QR code expired, refreshing...");
					const qrResp = await fetchQRCode(FIXED_BASE_URL, DEFAULT_ILINK_BOT_TYPE);
					if (qrResp.qrcode) {
						login.qrcode = qrResp.qrcode;
						login.qrcodeUrl = qrResp.qrcode_img_content ?? "";
						login.startedAt = Date.now();
						await renderQRCode(qrResp.qrcode_img_content ?? "", qrResp.qrcode);
						logger.debug("New QR code displayed. Please scan again.");
					}
					break;
				}

				default:
					// Unknown status, keep polling
					logger.debug("Unknown QR status", { status: statusResp.status });
					break;
			}
		} catch (err) {
			// Network errors are transient, keep polling
			logger.debug("QR poll network error", { error: String(err) });
		}

		// Wait before next poll
		await Bun.sleep(2000);
	}
}
