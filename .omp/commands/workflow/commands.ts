import type { HookCommandContext } from "@oh-my-pi/pi-coding-agent";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WORKFLOW_DAG, detectWorkflowState } from "../shared/workflow-context";

/**
 * Recursively collect all .md/.yaml/.yml files under a directory
 */
function collectFiles(dir: string, exts: string[]): string[] {
	const results: string[] = [];
	if (!existsSync(dir)) return results;

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...collectFiles(full, exts));
		} else if (exts.some(ext => entry.name.endsWith(ext))) {
			results.push(full);
		}
	}
	return results;
}

// ─── DAG state display ──────────────────────────────────────────────────────

function formatDAGState(state: Record<string, boolean>): string {
	const lines: string[] = [];

	for (const node of WORKFLOW_DAG) {
		const hasArtifacts = checkNodeArtifacts(node.id, state);
		const status = hasArtifacts ? "✅" : "⬜";
		const statusText = hasArtifacts ? "有产出" : "未开始";

		lines.push(`${status} **/${node.id}** — ${node.produces} (${statusText})`);

		if (node.enables.length > 0) {
			const enabledByState = node.enables.map(id => {
				const hasIt = checkNodeArtifacts(id, state);
				return hasIt ? `✅ /${id}` : `🔓 /${id}`;
			});
			lines.push(`   → 解锁: ${enabledByState.join(", ")}`);
		}
	}

	return lines.join("\n");
}

function checkNodeArtifacts(nodeId: string, state: Record<string, boolean>): boolean {
	switch (nodeId) {
		case "explore":
			return state["scene-alignment"] || state["key-technologies"];
		case "task":
			return state["tasks"];
		case "compound":
			return state["solutions"];
		default:
			return false;
	}
}

function suggestNextAction(state: Record<string, boolean>): string {
	// Prioritize: incomplete steps first, then next logical step
	if (!state["scene-alignment"] && !state["key-technologies"]) {
		return "💡 建议下一步：`/explore` — 开始梳理项目场景和关键技术";
	}
	if (!state["scene-alignment"] || !state["key-technologies"]) {
		return "💡 建议下一步：`/explore` — 继续完成探索（场景对齐或关键技术未完成）";
	}
	if (!state["tasks"]) {
		return "💡 建议下一步：`/task next` — 场景和技术已就绪，生成第一个任务";
	}

	// Check if there are pending tasks
	return "💡 建议下一步：`/task next` 生成新任务，或 `/compound` 沉淀经验";
}

// ─── Main execute ────────────────────────────────────────────────────────────

export async function execute(args: string[], ctx: HookCommandContext): Promise<string | undefined> {
	const cwd = ctx.cwd;
	const workflowDir = join(cwd, "docs", "workflow");
	const solutionsDir = join(cwd, "docs", "solutions");

	if (!existsSync(workflowDir) && !existsSync(solutionsDir)) {
		return [
			"## 工作流",
			"",
			"还没有工作流产物。开始使用：",
			"",
			"```",
			"/explore        → 梳理场景和关键技术",
			"/task next      → 生成渐进式任务",
			"/task done      → 完成任务（验证 + commit + achive）",
			"/compound       → 沉淀经验到 docs/solutions/",
			"```",
			"",
			"> 依赖是使能者不是关卡——你可以从任何命令开始。",
		].join("\n");
	}

	const state = detectWorkflowState(workflowDir);
	const lines: string[] = ["## 工作流状态\n"];

	// DAG overview
	lines.push("### 流程状态");
	lines.push("");
	lines.push(formatDAGState(state));
	lines.push("");

	// Next action suggestion
	lines.push(suggestNextAction(state));
	lines.push("");

	// Scene alignment detail
	const scenePath = join(workflowDir, "scene-alignment.md");
	if (existsSync(scenePath)) {
		const content = await readFile(scenePath, "utf-8");
		const firstLine = content.split("\n").find(l => l.trim() && !l.startsWith("#")) ?? "";
		lines.push(`### 场景对齐 ✅`);
		lines.push(`> ${firstLine.trim()}`);
		lines.push("");
	}

	// Key technologies detail
	const techPath = join(workflowDir, "key-technologies.md");
	if (existsSync(techPath)) {
		const content = await readFile(techPath, "utf-8");
		const firstLine = content.split("\n").find(l => l.trim() && !l.startsWith("#")) ?? "";
		lines.push(`### 关键技术 ✅`);
		lines.push(`> ${firstLine.trim()}`);
		lines.push("");
	}

	// Tasks detail
	const tasksDir = join(workflowDir, "tasks");
	if (existsSync(tasksDir)) {
		const files = readdirSync(tasksDir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
		if (files.length > 0) {
			lines.push("### 任务");
			let pending = 0, inProgress = 0, done = 0;
			for (const file of files) {
				const content = await readFile(join(tasksDir, file), "utf-8");
				const statusMatch = content.match(/status:\s*(\w+)/);
				const status = statusMatch?.[1] ?? "unknown";
				const icon = status === "done" ? "✅" : status === "in_progress" ? "🔄" : "⬜";
				lines.push(`- ${icon} \`${file}\``);
				if (status === "pending") pending++;
				else if (status === "in_progress") inProgress++;
				else if (status === "done") done++;
			}
			lines.push("");
			lines.push(`总计: ${files.length} | ⬜ 待处理: ${pending} | 🔄 进行中: ${inProgress} | ✅ 完成: ${done}`);
			lines.push("");
		}
	}

	// Achives detail
	const achivesDir = join(workflowDir, "achives");
	if (existsSync(achivesDir)) {
		const files = readdirSync(achivesDir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
		if (files.length > 0) {
			lines.push("### 完成记录");
			for (const file of files) {
				const content = await readFile(join(achivesDir, file), "utf-8");
				const commitMatch = content.match(/commit:\s*"?([a-f0-9]+)/);
				const resultMatch = content.match(/result:\s*(\w+)/);
				const commit = commitMatch?.[1] ?? "no-commit";
				const result = resultMatch?.[1] ?? "unknown";
				const icon = result === "pass" ? "✅" : result === "partial" ? "⚠️" : "❌";
				lines.push(`- ${icon} \`${file}\` — commit: \`${commit}\``);
			}
			lines.push("");
		}
	}

	// Solutions detail
	if (existsSync(solutionsDir)) {
		const solutionFiles = collectFiles(solutionsDir, [".md"]);
		if (solutionFiles.length > 0) {
			lines.push("### 经验库（docs/solutions/）");
			let bugs = 0, knowledge = 0, other = 0;
			for (const file of solutionFiles.sort()) {
				try {
					const content = await readFile(file, "utf-8");
					const typeMatch = content.match(/problem_type:\s*(\w+)/);
					const titleMatch = content.match(/title:\s*["']?(.+?)["']?\s*$/m);
					const problemType = typeMatch?.[1] ?? "";
					const title = titleMatch?.[1] ?? file.split(/[/\\]/).pop() ?? "";

					const isBug = ["build_error", "test_failure", "runtime_error", "performance_issue",
						"database_issue", "security_issue", "ui_bug", "integration_issue", "logic_error"].includes(problemType);
					const icon = isBug ? "🐛" : problemType ? "💡" : "📄";

					const relPath = file.replace(/\\/g, "/").replace(cwd.replace(/\\/g, "/"), "").replace(/^\//, "");
					lines.push(`- ${icon} \`${relPath}\` — ${title}`);

					if (isBug) bugs++;
					else if (problemType) knowledge++;
					else other++;
				} catch {
					// skip unreadable
				}
			}
			lines.push("");
			const parts: string[] = [`总计: ${solutionFiles.length}`];
			if (bugs > 0) parts.push(`🐛 Bug: ${bugs}`);
			if (knowledge > 0) parts.push(`💡 Knowledge: ${knowledge}`);
			if (other > 0) parts.push(`📄 其他: ${other}`);
			lines.push(parts.join(" | "));
			lines.push("");
		}
	}

	// Commands reference
	lines.push("### 命令");
	lines.push("| 命令 | 说明 |");
	lines.push("|---|---|");
	lines.push("| `/explore` | 梳理场景和关键技术 |");
	lines.push("| `/task next` | 生成下一个任务 |");
	lines.push("| `/task list` | 查看任务列表 |");
	lines.push("| `/task done` | 完成任务（验证 + commit + achive + compound） |");
	lines.push("| `/compound` | 沉淀经验（交互式） |");
	lines.push("| `/compound bug` | Bug track 快捷入口 |");
	lines.push("| `/compound knowledge` | Knowledge track 快捷入口 |");
	lines.push("| `/workflow` | 查看此状态 |");
	lines.push("");
	lines.push("> 依赖是使能者不是关卡——你可以从任何命令开始，不需要按顺序走完。");

	return lines.join("\n");
}
