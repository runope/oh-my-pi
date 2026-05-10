import type { HookCommandContext } from "@oh-my-pi/pi-coding-agent";
import { loadConfig } from "./config";
import { getUpstreamStatus, getCommitDetail, getCommitDiff } from "./git";
import { summarizeWithRules, categorizeCommits, analyzeModuleImpact } from "./summarize";
import { buildCommitListPrompt, buildLearnCommitPrompt } from "./llm-translate";
import { formatStatus, formatCommits, generateMarkdownReport, saveReport } from "./report";

/**
 * 子命令类型
 */
type SubCommand = "status" | "diff" | "report" | "learn" | "config" | "help";

/**
 * 解析命令参数
 */
function parseArgs(args: string[]): { subcommand: SubCommand; options: Record<string, string | number | boolean> } {
	const subcommands: SubCommand[] = ["status", "diff", "report", "learn", "config", "help"];

	let subcommand: SubCommand = "status";
	const options: Record<string, string | number | boolean> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (subcommands.includes(arg as SubCommand)) {
			subcommand = arg as SubCommand;
		} else if (arg.startsWith("--")) {
			const key = arg.slice(2);
			const value = args[i + 1];
			if (value && !value.startsWith("-")) {
				options[key] = isNaN(Number(value)) ? value : Number(value);
				i++;
			} else {
				options[key] = true;
			}
		} else if (arg.startsWith("-")) {
			const key = arg.slice(1);
			options[key] = true;
		} else {
			// 位置参数
			if (subcommand === "diff" && !options.count) {
				options.count = Number(arg) || 10;
			} else if (subcommand === "learn" && !options.hash) {
				options.hash = arg;
			}
		}
	}

	return { subcommand, options };
}

/**
 * 处理 status 子命令
 */
async function handleStatus(cwd: string): Promise<string> {
	const config = await loadConfig(cwd);
	const status = await getUpstreamStatus(cwd, config.remote, config.branch);
	return formatStatus(status);
}

/**
 * 处理 diff 子命令
 */
async function handleDiff(
	cwd: string,
	ctx: HookCommandContext,
	options: Record<string, string | number | boolean>,
): Promise<string> {
	const config = await loadConfig(cwd);
	const count = (options.count as number) || 10;

	const status = await getUpstreamStatus(cwd, config.remote, config.branch);

	if (status.behind === 0) {
		return "✓ 已是最新，没有新的 upstream 提交。";
	}

	const commits = status.behindCommits.slice(0, count);

	const summaries =
		config.translationMode === "llm"
			? commits.map((c) => summarizeWithRules(c))
			: commits.map((c) => summarizeWithRules(c));

	const categories = categorizeCommits(commits);

	if (config.translationMode === "llm" && ctx.hasUI) {
		const prompt = buildCommitListPrompt(commits);
		return `${formatCommits(summaries, categories)}\n\n---\n\n**提示**: 使用 LLM 进行智能翻译：\n\n${prompt}`;
	}

	return formatCommits(summaries, categories);
}

/**
 * 处理 report 子命令
 */
async function handleReport(
	cwd: string,
	options: Record<string, string | number | boolean>,
): Promise<string> {
	const config = await loadConfig(cwd);

	const status = await getUpstreamStatus(cwd, config.remote, config.branch);

	if (status.behind === 0) {
		return "✓ 已是最新，无需生成报告。";
	}

	const commits = status.behindCommits;
	const summaries = commits.map((c) => summarizeWithRules(c));
	const categories = categorizeCommits(commits);
	const moduleImpact = analyzeModuleImpact(commits);

	const report = generateMarkdownReport(status, summaries, categories, moduleImpact);

	const outputDir = (options.output as string) || config.outputDir;
	const filename = options.file as string | undefined;

	try {
		const outputPath = await saveReport(report, outputDir, filename);
		return `报告已生成: ${outputPath}\n\n${report}`;
	} catch {
		return report;
	}
}

/**
 * 处理 learn 子命令
 */
async function handleLearn(
	cwd: string,
	ctx: HookCommandContext,
	options: Record<string, string | number | boolean>,
): Promise<string> {
	const hash = options.hash as string;

	if (!hash) {
		return "用法: /upstream learn <commit-hash>\n\n请指定要学习的提交 hash。";
	}

	const commit = await getCommitDetail(cwd, hash);

	if (!commit) {
		return `未找到提交: ${hash}`;
	}

	const diff = await getCommitDiff(cwd, hash);
	const prompt = buildLearnCommitPrompt(commit, diff);

	if (ctx.hasUI) {
		return prompt;
	}

	return `
=== 提交详解 ===

**Hash**: ${commit.hash}
**标题**: ${commit.message}
**作者**: ${commit.author}
**日期**: ${commit.date}

**变更文件**:
${commit.files.map((f) => `- ${f}`).join("\n")}

**变更统计**: +${commit.linesAdded} / -${commit.linesRemoved}

运行此命令在交互模式下可获得 LLM 增强的详细解读。
`.trim();
}

/**
 * 处理 config 子命令
 */
async function handleConfig(cwd: string): Promise<string> {
	const config = await loadConfig(cwd);

	return `
=== Upstream Summary 配置 ===

Remote: ${config.remote}
Branch: ${config.branch}
Translation Mode: ${config.translationMode}
Output Dir: ${config.outputDir}

配置文件位置: .omp/extensions/upstream-summary/config.json
`.trim();
}

/**
 * 显示帮助
 */
function showHelp(): string {
	return `
=== Upstream Summary 帮助 ===

用法: /upstream <command> [options]

命令:
  status          查看 upstream 状态
  diff [count]    查看最近 N 个新提交（默认 10）
  report          生成完整报告（Markdown）
  learn <hash>    学习特定提交的详细信息
  config          查看配置
  help            显示此帮助

选项:
  --output <dir>  报告输出目录
  --file <name>   报告文件名
  --rule          使用规则匹配翻译（而非 LLM）

示例:
  /upstream status
  /upstream diff 20
  /upstream report --output ./reports
  /upstream learn fe6180e
`.trim();
}

/**
 * Custom Command execute — 返回 string 发送给 LLM。
 */
export async function execute(args: string[], ctx: HookCommandContext): Promise<string | undefined> {
	const { subcommand, options } = parseArgs(args);
	const cwd = ctx.cwd;

	try {
		switch (subcommand) {
			case "status":
				return await handleStatus(cwd);

			case "diff":
				return await handleDiff(cwd, ctx, options);

			case "report":
				return await handleReport(cwd, options);

			case "learn":
				return await handleLearn(cwd, ctx, options);

			case "config":
				return await handleConfig(cwd);

			case "help":
				return showHelp();

			default:
				return showHelp();
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return `❌ 错误: ${message}`;
	}
}
