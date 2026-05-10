import * as path from "node:path";
import type { GitCommit, UpstreamReport, CommitSummary } from "./types";
import type { CommitCategory } from "./types";

/**
 * 格式化状态输出
 */
export function formatStatus(status: {
	localBranch: string;
	upstreamBranch: string;
	localHead: string;
	upstreamHead: string;
	behind: number;
	ahead: number;
}): string {
	return `
=== Upstream 状态 ===

当前分支: ${status.localBranch}
Upstream 分支: ${status.upstreamBranch}

本地 HEAD:     ${status.localHead}
Upstream HEAD: ${status.upstreamHead}

落后提交: ${status.behind} 个
领先提交: ${status.ahead} 个${status.ahead > 0 ? " (你的二次开发)" : ""}

${status.behind > 0 ? "运行 /upstream diff 查看详情" : "✓ 已是最新"}
`.trim();
}

/**
 * 格式化提交列表输出
 */
export function formatCommits(
	summaries: CommitSummary[],
	categories: CommitCategory[],
	useEmoji = true,
): string {
	const lines: string[] = [];
	lines.push(`## Upstream 新提交 (${summaries.length} 个)\n`);

	for (const category of categories) {
		const icon = useEmoji ? category.icon : `[${category.type}]`;
		lines.push(`### ${icon} ${category.label} (${category.commits.length})\n`);

		for (const commit of category.commits) {
			const summary = summaries.find((s) => s.commit.hash === commit.hash);
			lines.push(`**${commit.shortHash}** ${summary?.titleZh || commit.message}`);
			lines.push(`- 日期: ${commit.date}`);
			if (commit.files.length > 0 && commit.files.length <= 5) {
				lines.push(`- 文件: \`${commit.files.join("`, `")}\``);
			} else if (commit.files.length > 5) {
				lines.push(`- 文件: ${commit.files.length} 个文件`);
			}
			if (summary?.impact) {
				const levelEmoji = { high: "🔴", medium: "🟡", low: "🟢" };
				lines.push(`- 影响: ${levelEmoji[summary.impact.level]} ${summary.impact.modules.join(", ") || "无"}`);
			}
			lines.push("");
		}
	}

	return lines.join("\n");
}

/**
 * 格式化模块影响统计
 */
export function formatModuleImpact(
	moduleImpact: Map<string, { files: number; commits: number; importance: "high" | "medium" | "low" }>,
): string {
	const lines: string[] = [];
	lines.push("## 模块影响统计\n");
	lines.push("| 模块 | 变更文件数 | 提交数 | 重要性 |");
	lines.push("|------|-----------|--------|--------|");

	const sorted = [...moduleImpact.entries()].sort((a, b) => b[1].commits - a[1].commits);

	for (const [module, stats] of sorted) {
		const importanceEmoji = { high: "🔴 高", medium: "🟡 中", low: "🟢 低" };
		lines.push(`| ${module} | ${stats.files} | ${stats.commits} | ${importanceEmoji[stats.importance]} |`);
	}

	return lines.join("\n");
}

/**
 * 格式化单个提交的详细信息
 */
export function formatCommitDetail(commit: GitCommit, diff: string): string {
	const lines: string[] = [];
	lines.push(`=== 提交详情 ===\n`);
	lines.push(`**Hash**: ${commit.hash}`);
	lines.push(`**标题**: ${commit.message}`);
	lines.push(`**作者**: ${commit.author}`);
	lines.push(`**日期**: ${commit.date}\n`);
	lines.push(`**变更文件**:`);

	for (const file of commit.files) {
		lines.push(`- ${file}`);
	}

	lines.push(`\n**变更统计**:`);
	lines.push(`- 添加: ${commit.linesAdded} 行`);
	lines.push(`- 删除: ${commit.linesRemoved} 行\n`);

	if (diff) {
		lines.push(`**Diff 摘要**:\n\`\`\`diff`);
		lines.push(diff.slice(0, 2000));
		if (diff.length > 2000) {
			lines.push(`\n... (已截断，共 ${diff.length} 字符)`);
		}
		lines.push(`\`\`\``);
	}

	return lines.join("\n");
}

/**
 * 生成完整的 Markdown 报告
 */
export function generateMarkdownReport(
	status: {
		localBranch: string;
		upstreamBranch: string;
		localHead: string;
		upstreamHead: string;
		behind: number;
		ahead: number;
	},
	summaries: CommitSummary[],
	categories: CommitCategory[],
	moduleImpact: Map<string, { files: number; commits: number; importance: "high" | "medium" | "low" }>,
): string {
	const lines: string[] = [];

	lines.push(`# Upstream 更新报告\n`);
	lines.push(`生成时间: ${new Date().toLocaleString("zh-CN")}\n`);

	// 状态
	lines.push(`## 状态概览\n`);
	lines.push(`| 项目 | 值 |`);
	lines.push(`|------|----|`);
	lines.push(`| 当前分支 | ${status.localBranch} |`);
	lines.push(`| Upstream 分支 | ${status.upstreamBranch} |`);
	lines.push(`| 本地 HEAD | ${status.localHead} |`);
	lines.push(`| Upstream HEAD | ${status.upstreamHead} |`);
	lines.push(`| 落后提交 | ${status.behind} |`);
	lines.push(`| 领先提交 | ${status.ahead} |\n`);

	// 提交列表
	if (summaries.length > 0) {
		lines.push(formatCommits(summaries, categories, true));
	}

	// 模块影响
	if (moduleImpact.size > 0) {
		lines.push("\n---\n");
		lines.push(formatModuleImpact(moduleImpact));
	}

	// 二次开发建议
	lines.push(`\n---\n`);
	lines.push(`## 二次开发建议\n`);

	if (status.behind > 0) {
		lines.push(`
1. **同步上游更新**:
   \`\`\`bash
   git fetch upstream
   git checkout main
   git rebase upstream/main
   git push origin main
   \`\`\`

2. **同步开发分支**:
   \`\`\`bash
   git checkout dev
   git rebase main
   git push origin dev --force-with-lease
   \`\`\`
`);
	} else {
		lines.push(`\n✓ 已是最新，无需同步。\n`);
	}

	return lines.join("\n");
}

/**
 * 保存报告到文件
 */
export async function saveReport(content: string, outputDir: string, filename?: string): Promise<string> {
	const fileName = filename || `upstream-report-${new Date().toISOString().split("T")[0]}.md`;
	const outputPath = path.join(outputDir, fileName);

	await Bun.write(outputPath, content);

	return outputPath;
}
