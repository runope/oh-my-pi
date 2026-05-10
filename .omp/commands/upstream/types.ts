/**
 * Upstream Summary - Git upstream 更新总结工具
 *
 * 功能：
 * - 查看 upstream 状态
 * - 对比本地与 upstream 的提交差异
 * - 生成中文更新摘要（LLM 增强）
 * - 学习特定提交的详细信息
 */

export interface UpstreamConfig {
	/** Upstream remote 名称，默认 'upstream' */
	remote: string;
	/** Upstream 分支名称，默认 'main' */
	branch: string;
	/** 翻译模式：'llm' | 'rule'，默认 'llm' */
	translationMode: "llm" | "rule";
	/** 报告输出目录，默认 './upstream-reports/' */
	outputDir: string;
}

export interface GitCommit {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	date: string;
	relativeDate: string;
	files: string[];
	linesAdded: number;
	linesRemoved: number;
}

export interface CommitCategory {
	type: "feat" | "fix" | "refactor" | "docs" | "test" | "chore" | "style" | "perf" | "other";
	label: string;
	icon: string;
	commits: GitCommit[];
}

export interface UpstreamStatus {
	/** 本地分支名称 */
	localBranch: string;
	/** Upstream 分支名称 */
	upstreamBranch: string;
	/** 本地最新提交 */
	localHead: string;
	/** Upstream 最新提交 */
	upstreamHead: string;
	/** 落后的提交数 */
	behind: number;
	/** 领先的提交数 */
	ahead: number;
	/** 落后的提交列表 */
	behindCommits: GitCommit[];
	/** 领先的提交列表 */
	aheadCommits: GitCommit[];
}

export interface CommitSummary {
	/** 原始提交信息 */
	commit: GitCommit;
	/** 中文标题 */
	titleZh: string;
	/** 中文描述 */
	descriptionZh?: string;
	/** 影响分析 */
	impact?: {
		level: "high" | "medium" | "low";
		modules: string[];
		note?: string;
	};
	/** 分类 */
	category: CommitCategory["type"];
}

export interface UpstreamReport {
	/** 生成时间 */
	generatedAt: string;
	/** 状态信息 */
	status: UpstreamStatus;
	/** 提交摘要列表 */
	summaries: CommitSummary[];
	/** 分类统计 */
	categories: CommitCategory[];
	/** 模块影响统计 */
	moduleImpact: Map<string, { files: number; commits: number; importance: "high" | "medium" | "low" }>;
}
