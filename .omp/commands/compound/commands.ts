import type { HookCommandContext } from "@oh-my-pi/pi-coding-agent";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prompt } from "@oh-my-pi/pi-utils";

import compoundPrompt from "../../prompts/workflow/compound.md" with { type: "text" };
import compoundHelpPrompt from "../../prompts/workflow/compound-help.md" with { type: "text" };
import { getProjectContextBlock } from "../shared/workflow-context";

/**
 * /compound — 经验沉淀：从问题和决策中提取可复用的知识
 *
 * 提示词与代码分离：.md 文件通过 import 导入，prompt.render() 渲染 Handlebars
 * 模板和分类列表内联在 compound.md 中，TypeScript 只负责加载动态数据
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BUG_TRACK_TYPES = new Set([
	"build_error", "test_failure", "runtime_error", "performance_issue",
	"database_issue", "security_issue", "ui_bug", "integration_issue", "logic_error",
]);

function isBugTrack(problemType: string): boolean {
	return BUG_TRACK_TYPES.has(problemType);
}

async function findOverlappingDocs(solutionsDir: string): Promise<string> {
	if (!existsSync(solutionsDir)) return "";

	const allFiles: string[] = [];
	function collectMd(dir: string) {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) collectMd(full);
			else if (entry.name.endsWith(".md")) allFiles.push(full);
		}
	}
	collectMd(solutionsDir);

	if (allFiles.length === 0) return "";

	const lines: string[] = [];
	for (const file of allFiles) {
		try {
			const content = await readFile(file, "utf-8");
			const frontmatter = content.split("\n").slice(0, 40).join("\n");
			const titleMatch = frontmatter.match(/title:\s*["']?(.+?)["']?\s*$/m);
			const typeMatch = frontmatter.match(/problem_type:\s*(\w+)/);
			const title = titleMatch?.[1] ?? file;
			const type = typeMatch?.[1] ?? "";
			const icon = isBugTrack(type) ? "🐛" : "💡";
			const relPath = file.replace(/\\/g, "/");
			const idx = relPath.indexOf("docs/solutions/");
			const displayPath = idx >= 0 ? relPath.slice(idx) : relPath;
			lines.push(`- ${icon} \`${displayPath}\` — ${title}`);
		} catch {
			// skip
		}
	}

	return lines.join("\n") || "";
}

// ─── Command Handlers ────────────────────────────────────────────────────────

async function handleCompound(
	workflowDir: string,
	track: "bug" | "knowledge" | "",
	topic: string,
	isAutoTrigger: boolean,
	projectContext: string,
): Promise<string> {
	const solutionsDir = join(workflowDir, "..", "solutions");
	const overlappingDocs = await findOverlappingDocs(solutionsDir);

	// Read current task context
	const tasksDir = join(workflowDir, "tasks");
	let currentTaskId = "";
	let currentTaskTitle = "";
	if (existsSync(tasksDir)) {
		const files = readdirSync(tasksDir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
		for (const file of files) {
			const content = await readFile(join(tasksDir, file), "utf-8");
			if (content.includes("status: in_progress") || content.includes("status: done")) {
				const idMatch = content.match(/^id:\s*(.+)/m);
				const titleMatch = content.match(/^title:\s*(.+)/m);
				currentTaskId = idMatch?.[1] ?? "";
				currentTaskTitle = titleMatch?.[1] ?? file;
				break;
			}
		}
	}

	const today = new Date().toISOString().slice(0, 10);

	// Build track selection — only when user hasn't pre-selected
	const trackSelection = !track
		? "请先告诉我要用哪个 track（bug 或 knowledge）。\n"
		: `已选择 **${track === "bug" ? "Bug 🐛" : "Knowledge 💡"}** track。跳过步骤 1，直接从步骤 2 开始。\n`;

	return prompt.render(compoundPrompt, {
		autoTriggerLabel: isAutoTrigger ? "（自动触发）" : "",
		trackSelection,
		topicSection: topic ? `**用户主题：** ${topic}` : "",
		today,
		overlappingDocsSection: overlappingDocs ? `### 现有文档（检查重叠）\n\n${overlappingDocs}` : "",
		currentTaskSection: (currentTaskId || currentTaskTitle)
			? `\n### 当前任务\n- ID: ${currentTaskId}\n- Title: ${currentTaskTitle}`
			: "",
		projectContext,
	});
}

// ─── Main Execute ────────────────────────────────────────────────────────────

export async function execute(args: string[], ctx: HookCommandContext): Promise<string | undefined> {
	const cwd = ctx.cwd;
	const workflowDir = join(cwd, "docs", "workflow");

	const isAutoTrigger = args.includes("--auto");
	const filteredArgs = args.filter(a => a !== "--auto");
	const firstArg = filteredArgs[0]?.toLowerCase() ?? "";

	if (firstArg === "help") {
		return compoundHelpPrompt;
	}

	// Track selection: bug / knowledge / none (LLM decides in prompt)
	let track: "bug" | "knowledge" | "" = "";
	let topicArgs: string[] = filteredArgs;

	if (firstArg === "bug") {
		track = "bug";
		topicArgs = filteredArgs.slice(1);
	} else if (firstArg === "knowledge") {
		track = "knowledge";
		topicArgs = filteredArgs.slice(1);
	}
	// else: no track prefix — all args are topic, track left for LLM to decide

	const topic = topicArgs.join(" ").trim();

	const projectContext = await getProjectContextBlock(ctx.cwd);
	return handleCompound(workflowDir, track, topic, isAutoTrigger, projectContext);
}
