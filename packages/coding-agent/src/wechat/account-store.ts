/**
 * WeChat account store — persistent credential management.
 *
 * Stores per-account credentials (token, baseUrl, userId) under ~/.omp/wechat/accounts/.
 * Account index tracks all registered accounts.
 *
 * Ported from @tencent-weixin/openclaw-weixin/src/auth/accounts.ts
 * with OMP-specific directory conventions.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAgentDir, logger } from "@oh-my-pi/pi-utils";

// ============================================================================
// Directory resolution
// ============================================================================

function resolveWechatDir(): string {
	return path.join(getAgentDir(), "wechat");
}

function resolveAccountIndexPath(): string {
	return path.join(resolveWechatDir(), "accounts.json");
}

function resolveAccountsDir(): string {
	return path.join(resolveWechatDir(), "accounts");
}

function resolveAccountPath(accountId: string): string {
	return path.join(resolveAccountsDir(), `${accountId}.json`);
}

// ============================================================================
// Account data types
// ============================================================================
export interface WeixinAccountData {
	token?: string;
	baseUrl?: string;
	userId?: string;
	/** Peer ID to sync CLI input/output to (persisted across sessions) */
	syncPeerId?: string;
	/** When the account was registered (ISO string) */
	createdAt?: string;
	/** When the account was last used */
	lastUsedAt?: string;
}

export interface ResolvedWeixinAccount {
	accountId: string;
	token: string;
	baseUrl: string;
	userId?: string;
	/** Persisted sync peer ID, if one was saved */
	syncPeerId?: string;
}

// ============================================================================
// Account index
// ============================================================================

async function ensureDir(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
}

/** Returns all accountIds registered via QR login */
export async function listIndexedWeixinAccountIds(): Promise<string[]> {
	try {
		const text = await Bun.file(resolveAccountIndexPath()).text();
		const ids: string[] = JSON.parse(text);
		return Array.isArray(ids) ? ids : [];
	} catch {
		return [];
	}
}

/** Add accountId to the persistent index (no-op if already present) */
export async function registerWeixinAccountId(accountId: string): Promise<void> {
	const ids = await listIndexedWeixinAccountIds();
	if (!ids.includes(accountId)) {
		ids.push(accountId);
	}
	await ensureDir(path.dirname(resolveAccountIndexPath()));
	await Bun.write(resolveAccountIndexPath(), JSON.stringify(ids, null, 2));
}

/** Remove accountId from the persistent index */
export async function unregisterWeixinAccountId(accountId: string): Promise<void> {
	const ids = await listIndexedWeixinAccountIds();
	const filtered = ids.filter(id => id !== accountId);
	await ensureDir(path.dirname(resolveAccountIndexPath()));
	await Bun.write(resolveAccountIndexPath(), JSON.stringify(filtered, null, 2));
}

// ============================================================================
// Account store (per-account credential files)
// ============================================================================

/** Load account data by ID */
export async function loadWeixinAccount(accountId: string): Promise<WeixinAccountData | null> {
	try {
		return await Bun.file(resolveAccountPath(accountId)).json();
	} catch {
		return null;
	}
}

/** Persist account data after QR login (merges into existing file) */
export async function saveWeixinAccount(
	accountId: string,
	update: { token?: string; baseUrl?: string; userId?: string; syncPeerId?: string },
): Promise<void> {
	await ensureDir(resolveAccountsDir());

	const existing = await loadWeixinAccount(accountId);
	const data: WeixinAccountData = {
		...existing,
		...update,
		createdAt: existing?.createdAt ?? new Date().toISOString(),
		lastUsedAt: new Date().toISOString(),
	};

	// null syncPeerId means delete the stored value
	if (update.syncPeerId === undefined) {
		delete data.syncPeerId;
	}

	await Bun.write(resolveAccountPath(accountId), JSON.stringify(data, null, 2));
	await registerWeixinAccountId(accountId);
}

/** Remove all files associated with an account */
export async function clearWeixinAccount(accountId: string): Promise<void> {
	try {
		await fs.rm(resolveAccountPath(accountId), { force: true });
	} catch {
		// ignore if file doesn't exist
	}
	await unregisterWeixinAccountId(accountId);
}

/** Resolve an account by ID, returning required credentials */
export async function resolveWeixinAccount(accountId?: string | null): Promise<ResolvedWeixinAccount | null> {
	// If no specific account, pick the most recently used one
	if (!accountId) {
		const ids = await listIndexedWeixinAccountIds();
		if (ids.length === 0) {
			logger.warn("No WeChat accounts registered. Run `omp wechat login` first.");
			return null;
		}

		// Find the most recently used account
		let bestId = ids[0];
		let bestTime = "";
		for (const id of ids) {
			const data = await loadWeixinAccount(id);
			if (data?.lastUsedAt && data.lastUsedAt > bestTime) {
				bestTime = data.lastUsedAt;
				bestId = id;
			}
		}
		accountId = bestId;

		if (ids.length > 1) {
			logger.debug(`Multiple WeChat accounts found, using most recent: ${accountId}`);
		}
	}

	const data = await loadWeixinAccount(accountId);
	if (!data?.token || !data.baseUrl) {
		logger.error(`WeChat account ${accountId} has incomplete credentials. Please re-login.`);
		return null;
	}

	return {
		accountId,
		token: data.token,
		baseUrl: data.baseUrl,
		userId: data.userId,
		syncPeerId: data.syncPeerId,
	};
}

/** List all resolved accounts */
export async function listResolvedAccounts(): Promise<ResolvedWeixinAccount[]> {
	const ids = await listIndexedWeixinAccountIds();
	const accounts: ResolvedWeixinAccount[] = [];

	for (const id of ids) {
		const resolved = await resolveWeixinAccount(id);
		if (resolved) {
			accounts.push(resolved);
		}
	}

	return accounts;
}
