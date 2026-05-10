import type { GitCommit, CommitCategory, CommitSummary, UpstreamReport } from "./types";

/**
 * 提交类型映射（规则匹配）
 */
const TYPE_MAP: Record<string, CommitCategory["type"]> = {
	feat: "feat",
	fix: "fix",
	refactor: "refactor",
	docs: "docs",
	test: "test",
	chore: "chore",
	style: "style",
	perf: "perf",
	build: "chore",
	ci: "chore",
	revert: "chore",
};

/**
 * 类型标签映射
 */
const TYPE_LABELS: Record<CommitCategory["type"], { label: string; icon: string }> = {
	feat: { label: "新功能", icon: "✨" },
	fix: { label: "修复", icon: "🐛" },
	refactor: { label: "重构", icon: "🔨" },
	docs: { label: "文档", icon: "📝" },
	test: { label: "测试", icon: "✅" },
	chore: { label: "杂项", icon: "🔧" },
	style: { label: "样式", icon: "💄" },
	perf: { label: "性能", icon: "⚡" },
	other: { label: "其他", icon: "📦" },
};

/**
 * 关键词翻译映射
 */
const KEYWORD_MAP: Record<string, string> = {
	// 动作
	add: "添加",
	remove: "移除",
	delete: "删除",
	update: "更新",
	fix: "修复",
	improve: "改进",
	support: "支持",
	implement: "实现",
	refactor: "重构",
	optimize: "优化",
	simplify: "简化",
	enhance: "增强",
	extend: "扩展",
	rename: "重命名",
	replace: "替换",
	clean: "清理",
	merge: "合并",
	split: "拆分",
	extract: "提取",
	move: "移动",

	// 常见对象
	feature: "功能",
	bug: "问题",
	error: "错误",
	issue: "问题",
	crash: "崩溃",
	memory: "内存",
	performance: "性能",
	security: "安全",
	type: "类型",
	interface: "接口",
	function: "函数",
	method: "方法",
	class: "类",
	module: "模块",
	component: "组件",
	handler: "处理器",
	utility: "工具",
	helper: "辅助函数",
	config: "配置",
	option: "选项",
	setting: "设置",
	test: "测试",
	doc: "文档",
	documentation: "文档",
	validation: "验证",
	check: "检查",
	parsing: "解析",
	parsing: "解析",
	render: "渲染",
	display: "显示",
	output: "输出",
	input: "输入",
	stream: "流",
	async: "异步",
	sync: "同步",
	cache: "缓存",
	log: "日志",
	notification: "通知",
};

/**
 * 从提交消息中提取类型
 */
export function parseCommitType(message: string): CommitCategory["type"] {
	const match = message.match(/^(\w+)(\([^)]+\))?:/);
	if (match) {
		const type = match[1].toLowerCase();
		return TYPE_MAP[type] || "other";
	}
	return "other";
}

/**
 * 从提交消息中提取作用域
 */
export function parseCommitScope(message: string): string | undefined {
	const match = message.match(/^\w+\(([^)]+)\):/);
	return match ? match[1] : undefined;
}

/**
 * 规则匹配翻译（简单版本）
 */
export function translateWithRules(message: string): string {
	// 提取类型和描述
	const typeMatch = message.match(/^\w+(?:\([^)]+\))?:\s*(.+)$/);
	const description = typeMatch ? typeMatch[1] : message;

	// 替换关键词
	let translated = description;
	for (const [en, zh] of Object.entries(KEYWORD_MAP)) {
		const regex = new RegExp(`\\b${en}\\b`, "gi");
		translated = translated.replace(regex, zh);
	}

	return translated;
}

/**
 * 分析提交影响
 */
export function analyzeImpact(commit: GitCommit): CommitSummary["impact"] {
	const importantPaths = [
		"src/modes/",
		"src/tools/",
		"src/session/",
		"src/lsp/",
		"src/mcp/",
		"src/commands/",
	];

	const modules: string[] = [];
	let importance: "high" | "medium" | "low" = "low";

	for (const file of commit.files) {
		for (const path of importantPaths) {
			if (file.startsWith(path)) {
				const module = path.replace(/\/$/, "").split("/").pop() || "";
				if (!modules.includes(module)) {
					modules.push(module);
				}
				importance = "high";
			}
		}

		// 中等重要性
		if (file.startsWith("src/") && importance === "low") {
			importance = "medium";
		}
	}

	return {
		level: importance,
		modules,
	};
}

/**
 * 分类提交列表
 */
export function categorizeCommits(commits: GitCommit[]): CommitCategory[] {
	const categoryMap = new Map<CommitCategory["type"], GitCommit[]>();

	for (const commit of commits) {
		const type = parseCommitType(commit.message);
		const list = categoryMap.get(type) || [];
		list.push(commit);
		categoryMap.set(type, list);
	}

	// 按优先级排序
	const order: CommitCategory["type"][] = ["feat", "fix", "perf", "refactor", "docs", "test", "style", "chore", "other"];
	const categories: CommitCategory[] = [];

	for (const type of order) {
		const commits = categoryMap.get(type);
		if (commits && commits.length > 0) {
			const { label, icon } = TYPE_LABELS[type];
			categories.push({ type, label, icon, commits });
		}
	}

	return categories;
}

/**
 * 生成模块影响统计
 */
export function analyzeModuleImpact(
	commits: GitCommit[],
): Map<string, { files: number; commits: number; importance: "high" | "medium" | "low" }> {
	const moduleMap = new Map<string, Set<string>>();

	for (const commit of commits) {
		for (const file of commit.files) {
			// 提取模块名
			const parts = file.split("/");
			const module = parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0];

			if (!moduleMap.has(module)) {
				moduleMap.set(module, new Set());
			}
			moduleMap.get(module)!.add(commit.hash);
		}
	}

	const result = new Map<string, { files: number; commits: number; importance: "high" | "medium" | "low" }>();

	for (const [module, commitSet] of moduleMap) {
		const commitCount = commitSet.size;
		const importance = module.startsWith("src/") ? (commitCount > 3 ? "high" : "medium") : "low";

		result.set(module, {
			files: moduleMap.size,
			commits: commitCount,
			importance,
		});
	}

	return result;
}

/**
 * 使用规则生成提交摘要（不使用 LLM）
 */
export function summarizeWithRules(commit: GitCommit): CommitSummary {
	const category = parseCommitType(commit.message);
	const titleZh = translateWithRules(commit.message);
	const impact = analyzeImpact(commit);

	return {
		commit,
		titleZh,
		category,
		impact,
	};
}

/**
 * 生成报告（不使用 LLM）
 */
export function generateReportWithRules(status: UpstreamStatus["behindCommits"]): UpstreamReport {
	const summaries = status.map(summarizeWithRules);
	const categories = categorizeCommits(status);
	const moduleImpact = analyzeModuleImpact(status);

	return {
		generatedAt: new Date().toISOString(),
		status: {
			localBranch: "",
			upstreamBranch: "",
			localHead: "",
			upstreamHead: "",
			behind: status.length,
			ahead: 0,
			behindCommits: status,
			aheadCommits: [],
		},
		summaries,
		categories,
		moduleImpact,
	};
}
