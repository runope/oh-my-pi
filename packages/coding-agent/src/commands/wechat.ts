/**
 * WeChat bot CLI command — bridges WeChat messages with OMP agent.
 *
 * Usage:
 *   omp wechat login           — QR code login
 *   omp wechat start           — Start the bot
 *   omp wechat status          — Show status
 *   omp wechat logout          — Remove credentials
 *   omp wechat accounts        — List accounts
 */
import { Args, Command, Flags } from "@oh-my-pi/pi-utils/cli";
import { runWechatCommand } from "../wechat";

export default class Wechat extends Command {
	static description = "WeChat integration — login, start, bridge, status, logout, accounts";

	static args = {
		subcommand: Args.string({
			description: "Subcommand: login, start, bridge, status, logout, accounts",
			required: true,
		}),
	};

	static flags = {
		account: Flags.string({ description: "Account ID to use" }),
		allow: Flags.string({ description: "Allowed WeChat user ID (repeatable)", multiple: true }),
		cwd: Flags.string({ char: "C", description: "Working directory for agent sessions" }),
	};

	async run(): Promise<void> {
		const { args, flags } = await this.parse(Wechat);

		const subcommand = args.subcommand as string;
		const extraArgs: string[] = [];

		if (flags.account) {
			extraArgs.push("--account", flags.account);
		}
		if (flags.allow) {
			for (const userId of flags.allow) {
				extraArgs.push("--allow", userId);
			}
		}

		// Handle Ctrl+C for graceful shutdown
		const controller = new AbortController();
		const onSigInt = () => {
			console.log("WeChat bot shutting down...");
			controller.abort();
		};
		process.on("SIGINT", onSigInt);

		try {
			const result = await runWechatCommand(subcommand, extraArgs, {
				cwd: flags.cwd,
				signal: controller.signal,
			});

			if (result.success) {
				if (result.message) {
					console.log(result.message);
				}
			} else {
				console.error(result.error);
				process.exitCode = 1;
			}
		} finally {
			process.off("SIGINT", onSigInt);
		}
	}
}
