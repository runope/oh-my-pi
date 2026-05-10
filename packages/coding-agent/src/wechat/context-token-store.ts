/**
 * WeChat context token store — in-process cache with disk persistence.
 *
 * contextToken is issued per-message by the WeChat getUpdates API and must
 * be echoed verbatim in every outbound send. The in-memory map is the primary
 * lookup; a disk-backed file per account ensures tokens survive restarts.
 *
 * Ported from @tencent-weixin/openclaw-weixin/src/messaging/inbound.ts
 */

import * as path from "node:path";
import { getAgentDir, logger } from "@oh-my-pi/pi-utils";

// ============================================================================
// In-memory store
// ============================================================================

const contextTokenStore = new Map<string, string>();

function contextTokenKey(accountId: string, userId: string): string {
	return `${accountId}:${userId}`;
}

// ============================================================================
// Disk persistence
// ============================================================================

function resolveContextTokenFilePath(accountId: string): string {
	return path.join(getAgentDir(), "wechat", "context-tokens", `${accountId}.json`);
}

/** Persist all context tokens for a given account to disk */
async function persistContextTokens(accountId: string): Promise<void> {
	const entries: Record<string, string> = {};
	for (const [key, value] of contextTokenStore) {
		if (key.startsWith(`${accountId}:`)) {
			entries[key] = value;
		}
	}

	try {
		const filePath = resolveContextTokenFilePath(accountId);
		await Bun.write(filePath, JSON.stringify(entries, null, 2));
	} catch (err) {
		logger.warn("Failed to persist WeChat context tokens", { accountId, error: String(err) });
	}
}

/** Restore persisted context tokens for an account into the in-memory map */
export async function restoreContextTokens(accountId: string): Promise<void> {
	try {
		const filePath = resolveContextTokenFilePath(accountId);
		const entries = (await Bun.file(filePath).json()) as Record<string, string>;
		for (const [key, value] of Object.entries(entries)) {
			contextTokenStore.set(key, value);
		}
	} catch {
		// File may not exist yet
	}
}

/** Remove all context tokens for a given account (memory + disk) */
export async function clearContextTokensForAccount(accountId: string): Promise<void> {
	for (const key of contextTokenStore.keys()) {
		if (key.startsWith(`${accountId}:`)) {
			contextTokenStore.delete(key);
		}
	}

	try {
		const filePath = resolveContextTokenFilePath(accountId);
		const { rm } = await import("node:fs/promises");
		await rm(filePath, { force: true });
	} catch {
		// ignore
	}
}

/** Store a context token for a given account+user pair */
export function setContextToken(accountId: string, userId: string, token: string): void {
	contextTokenStore.set(contextTokenKey(accountId, userId), token);
	// Fire-and-forget persistence
	persistContextTokens(accountId).catch(() => {});
}

/** Retrieve the cached context token for a given account+user pair */
export function getContextToken(accountId: string, userId: string): string | undefined {
	return contextTokenStore.get(contextTokenKey(accountId, userId));
}
