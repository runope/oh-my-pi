/**
 * WeChat integration public API and CLI commands.
 *
 * Usage:
 *   omp wechat login          — QR code login
 *   omp wechat start          — Start the bot (headless)
 *   omp wechat bridge         — Start interactive bridge (terminal + WeChat)
 *   omp wechat status         — Show bot status
 *   omp wechat logout         — Remove stored credentials
 *   omp wechat accounts       — List registered accounts
 */

export {
	clearWeixinAccount,
	listIndexedWeixinAccountIds,
	listResolvedAccounts,
	type ResolvedWeixinAccount,
	resolveWeixinAccount,
	type WeixinAccountData,
} from "./account-store";
export {
	buildBaseInfo,
	getConfig,
	getUpdates,
	sendMessage,
	sendTyping,
	type WeixinApiOptions,
} from "./api";
export { startWeixinLogin, type WeixinQrStartResult, type WeixinQrWaitResult, waitForWeixinLogin } from "./auth";
export { WechatBot, type WechatBotOptions } from "./bot";

export { WechatBridge, type WechatBridgeOptions } from "./bridge";

export { WechatChannel, type WechatChannelOptions } from "./channel";
export { filterMarkdown, StreamingMarkdownFilter } from "./markdown-filter";
export type * from "./types";

// ============================================================================
// CLI integration
// ============================================================================

import { clearWeixinAccount, listIndexedWeixinAccountIds, listResolvedAccounts } from "./account-store";
import { startWeixinLogin, waitForWeixinLogin } from "./auth";
import { WechatBot } from "./bot";

import { WechatBridge } from "./bridge";

/** Result of a CLI command execution */
export type CliResult = { success: true; message?: string } | { success: false; error: string };

/**
 * Run the `omp wechat login` command.
 * Starts QR code login flow.
 */
export async function runWechatLogin(): Promise<CliResult> {
	try {
		const result = await startWeixinLogin();
		console.log("Waiting for WeChat scan confirmation...");

		const waitResult = await waitForWeixinLogin(result.loginId);

		if (waitResult.success) {
			return {
				success: true,
				message: `Logged in successfully as account ${waitResult.accountId}`,
			};
		}

		return {
			success: false,
			error: `Login failed: ${waitResult.reason} — ${waitResult.error ?? "unknown"}`,
		};
	} catch (err) {
		return {
			success: false,
			error: `Login error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/**
 * Run the `omp wechat start` command.
 * Starts the WeChat-OMP bot.
 */
export async function runWechatStart(options?: {
	cwd?: string;
	accountId?: string;
	allowUsers?: string[];
	signal?: AbortSignal;
}): Promise<CliResult> {
	const bot = new WechatBot({
		cwd: options?.cwd,
		accountId: options?.accountId,
		signal: options?.signal,
		allowUsers: options?.allowUsers,
	});

	try {
		await bot.start();

		// Bot runs until signal is aborted
		// Return is handled by signal
		return { success: true, message: "WeChat bot stopped" };
	} catch (err) {
		await bot.stop();
		return {
			success: false,
			error: `Bot error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/**
 * Run the `omp wechat bridge` command.
 * Starts the interactive WeChat-OMP bridge.
 */
export async function runWechatBridge(options?: {
	cwd?: string;
	accountId?: string;
	allowUsers?: string[];
	signal?: AbortSignal;
}): Promise<CliResult> {
	const bridge = new WechatBridge({
		cwd: options?.cwd,
		accountId: options?.accountId,
		signal: options?.signal,
		allowUsers: options?.allowUsers,
	});

	try {
		await bridge.start();
		return { success: true, message: "WeChat bridge stopped" };
	} catch (err) {
		await bridge.stop();
		return {
			success: false,
			error: `Bridge error: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}

/**
 * Run the `omp wechat status` command.
 * Shows current bot status and account info.
 */
export async function runWechatStatus(): Promise<CliResult> {
	const accounts = await listResolvedAccounts();
	const accountIds = await listIndexedWeixinAccountIds();

	if (accountIds.length === 0) {
		return {
			success: true,
			message: "No WeChat accounts registered. Run `omp wechat login` to get started.",
		};
	}

	const lines = ["WeChat Accounts:"];
	for (const account of accounts) {
		lines.push(`  - ${account.accountId} (userId: ${account.userId ?? "unknown"}, baseUrl: ${account.baseUrl})`);
	}

	if (accountIds.length > accounts.length) {
		lines.push(`  (${accountIds.length - accounts.length} accounts with incomplete credentials)`);
	}

	return { success: true, message: lines.join("\n") };
}

/**
 * Run the `omp wechat logout` command.
 * Removes stored credentials for an account.
 */
export async function runWechatLogout(accountId?: string): Promise<CliResult> {
	const ids = await listIndexedWeixinAccountIds();

	if (ids.length === 0) {
		return { success: true, message: "No WeChat accounts to log out from." };
	}

	const targetId = accountId ?? ids[0];
	await clearWeixinAccount(targetId);

	return {
		success: true,
		message: `Logged out and removed account: ${targetId}`,
	};
}

/**
 * Run the `omp wechat accounts` command.
 * Lists all registered accounts.
 */
export async function runWechatAccounts(): Promise<CliResult> {
	const ids = await listIndexedWeixinAccountIds();

	if (ids.length === 0) {
		return { success: true, message: "No WeChat accounts registered." };
	}

	const accounts = await listResolvedAccounts();
	const lines = [`Registered WeChat accounts (${ids.length}):`];

	for (const account of accounts) {
		lines.push(`  ${account.accountId}:`);
		lines.push(`    userId: ${account.userId ?? "unknown"}`);
		lines.push(`    baseUrl: ${account.baseUrl}`);
		lines.push(`    hasToken: ${Boolean(account.token)}`);
	}

	return { success: true, message: lines.join("\n") };
}

/**
 * Main CLI dispatch for `omp wechat <subcommand>`.
 */
export async function runWechatCommand(
	subcommand: string,
	args: string[] = [],
	options?: { cwd?: string; signal?: AbortSignal },
): Promise<CliResult> {
	switch (subcommand) {
		case "login":
			return runWechatLogin();

		case "start": {
			// Parse --account and --allow flags
			let accountId: string | undefined;
			const allowUsers: string[] = [];

			for (let i = 0; i < args.length; i++) {
				if (args[i] === "--account" && i + 1 < args.length) {
					accountId = args[++i];
				} else if (args[i] === "--allow" && i + 1 < args.length) {
					allowUsers.push(args[++i]);
				}
			}

			return runWechatStart({
				cwd: options?.cwd,
				accountId,
				allowUsers,
				signal: options?.signal,
			});
		}


		case "bridge": {
			let accountId: string | undefined;
			const allowUsers: string[] = [];

			for (let i = 0; i < args.length; i++) {
				if (args[i] === "--account" && i + 1 < args.length) {
					accountId = args[++i];
				} else if (args[i] === "--allow" && i + 1 < args.length) {
					allowUsers.push(args[++i]);
				}
			}

			return runWechatBridge({
				cwd: options?.cwd,
				accountId,
				allowUsers,
				signal: options?.signal,
			});
		}

		case "status":
			return runWechatStatus();

		case "logout": {
			const accountId = args[0];
			return runWechatLogout(accountId);
		}

		case "accounts":
			return runWechatAccounts();

		default:
			return {
				success: false,
			error: `Unknown wechat subcommand: ${subcommand}\nAvailable: login, start, bridge, status, logout, accounts`,
			};
	}
}
