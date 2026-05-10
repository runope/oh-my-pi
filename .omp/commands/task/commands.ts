import type { HookCommandContext } from "@oh-my-pi/pi-coding-agent";
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prompt } from "@oh-my-pi/pi-utils";
import { getProjectContextBlock } from "../shared/workflow-context";

import taskNextPrompt from "../../prompts/workflow/task-next.md" with { type: "text" };
import taskDonePrompt from "../../prompts/workflow/task-done.md" with { type: "text" };
import taskHelpPrompt from "../../prompts/workflow/task-help.md" with { type: "text" };

/**
 * /task — 任务生成、列表、完成
 *
 * 提示词与代码分离：.md 文件通过 import 导入，prompt.render() 渲染 Handlebars
 */

type SubCommand = "list" | "next" | "done" | "help";

function parseArgs(args: string[]): { subcommand: SubCommand; taskName: string; topic: string } {
	if (args.length === 0) return { subcommand: "list", taskName: "", topic: "" };
	const first = args[0].toLowerCase();
	if (first === "list" || first === "ls") return { subcommand: "list", taskName: "", topic: "" };
	if (first === "next") return { subcommand: "next", taskName: "", topic: args.slice(1).join(" ").trim() };
	if (first === "done") return { subcommand: "done", taskName: args.slice(1).join(" "), topic: "" };
	if (first === "help") return { subcommand: "help", taskName: "", topic: "" };
	// Non-subcommand args = task description → generate next with topic
	return { subcommand: "next", taskName: "", topic: args.join(" ").trim() };
}

async function listTasks(workflowDir: string): Promise<string> {
	const tasksDir = join(workflowDir, "tasks");
	if (!existsSync(tasksDir)) {
		return "没有任务。使用 `/task next` 基于场景和技术文档生成第一个任务。";
	}

	const files = readdirSync(tasksDir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
	if (files.length === 0) {
		return "没有任务。使用 `/task next` 生成第一个任务。";
	}

	const lines = ["## 任务列表\n"];
	let pending = 0, inProgress = 0, done = 0;

	// Build checkbox summary for tasks.md
	const checkboxLines: string[] = ["# 任务进度", "", `> 自动生成 — /task list 更新`, ""];

	for (const file of files) {
		const content = await readFile(join(tasksDir, file), "utf-8");
		const statusMatch = content.match(/status:\s*(\w+)/);
		const titleMatch = content.match(/^title:\s*(.+)/m);
		const idMatch = content.match(/^id:\s*(.+)/m);
		const status = statusMatch?.[1] ?? "unknown";
		const title = titleMatch?.[1] ?? file;
		const id = idMatch?.[1] ?? "";
		const icon = status === "done" ? "✅" : status === "in_progress" ? "🔄" : "⬜";
		const check = status === "done" ? "x" : " ";
		lines.push(`- ${icon} \`${file}\` — ${status}`);
		checkboxLines.push(`- [${check}] ${id}: ${title}`);
		if (status === "pending") pending++;
		else if (status === "in_progress") inProgress++;
		else if (status === "done") done++;
	}

	lines.push("");
	lines.push(`总计: ${files.length} | ⬜ 待处理: ${pending} | 🔄 进行中: ${inProgress} | ✅ 完成: ${done}`);
	lines.push("");
	lines.push("使用 `/task next` 生成下一个任务");
	lines.push("使用 `/task done <文件名>` 标记任务完成（自动验收 + commit）");

	// Write checkbox summary to tasks.md (human + LLM readable)
	try {
		await writeFile(join(workflowDir, "tasks.md"), checkboxLines.join("\n") + "\n");
	} catch {
		// non-critical — summary is a convenience, not a requirement
	}

	return lines.join("\n");
}

async function generateNextTask(workflowDir: string, projectContext: string, topic: string = ""): Promise<string> {
	const scenePath = join(workflowDir, "scene-alignment.md");
	const techPath = join(workflowDir, "key-technologies.md");
	const tasksDir = join(workflowDir, "tasks");

	let context = "";
	if (existsSync(scenePath)) {
		context += `\n\n### 场景对齐\n\n${await readFile(scenePath, "utf-8")}`;
	}
	if (existsSync(techPath)) {
		context += `\n\n### 关键技术\n\n${await readFile(techPath, "utf-8")}`;
	}

	let existingTasks = "";
	if (existsSync(tasksDir)) {
		const files = readdirSync(tasksDir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
		if (files.length > 0) {
			existingTasks = "\n\n### 已有任务\n";
			for (const file of files) {
				const content = await readFile(join(tasksDir, file), "utf-8");
				existingTasks += `\n--- ${file} ---\n${content}\n`;
			}
		}
	}

	const solutionsDir = join(workflowDir, "..", "solutions");
	let compounds = "";
	if (existsSync(solutionsDir)) {
		compounds = "\n\n### 已有经验\n请检查 docs/solutions/ 目录中是否有相关的经验记录。";
	}

	let nextNum = 1;
	if (existsSync(tasksDir)) {
		const files = readdirSync(tasksDir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
		if (files.length > 0) {
			const lastFile = files[files.length - 1];
			const match = lastFile.match(/task-(\d+)/);
			if (match) nextNum = parseInt(match[1]) + 1;
		}
	}

	const paddedNum = String(nextNum).padStart(2, "0");

	return prompt.render(taskNextPrompt, {
		paddedNum,
		context: context || "(没有场景对齐或技术文档。基于当前对话上下文直接生成任务。如有需要可先运行 `/explore`。)",
		existingTasks,
		compounds,
		projectContext,
		topicSection: topic ? `**用户指定的任务方向：** ${topic}` : "",
	});
}

async function markDone(workflowDir: string, taskName: string, projectContext: string): Promise<string> {
	const tasksDir = join(workflowDir, "tasks");

	if (!taskName) {
		if (existsSync(tasksDir)) {
			const files = readdirSync(tasksDir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
			for (const file of files) {
				const content = await readFile(join(tasksDir, file), "utf-8");
				if (content.includes("status: in_progress")) {
					taskName = file.replace(/\.(yaml|yml)$/, "");
					break;
				}
			}
		}
		if (!taskName) {
			if (existsSync(tasksDir)) {
				const files = readdirSync(tasksDir).filter(f => f.endsWith(".yaml") || f.endsWith(".yml")).sort();
				for (const file of files) {
					const content = await readFile(join(tasksDir, file), "utf-8");
					if (content.includes("status: pending")) {
						taskName = file.replace(/\.(yaml|yml)$/, "");
						break;
					}
				}
			}
		}
	}

	if (!taskName) {
		return "没有找到进行中或待处理的任务。使用 `/task next` 生成新任务。";
	}

	const taskFile = taskName.endsWith(".yaml") ? taskName : `${taskName}.yaml`;
	const taskPath = join(tasksDir, taskFile);

	if (!existsSync(taskPath)) {
		return `任务文件不存在：${taskFile}\n\n使用 \`/task list\` 查看现有任务。`;
	}

	const taskContent = await readFile(taskPath, "utf-8");
	const taskId = taskName.match(/task-\d+/)?.[0] ?? "task-XX";
	const taskTitle = taskName.replace(/task-\d+-/, "");

	return prompt.render(taskDonePrompt, {
		taskName,
		taskFile,
		taskContent,
		taskId,
		taskTitle,
		projectContext,
	});
}

export async function execute(args: string[], ctx: HookCommandContext): Promise<string | undefined> {
	const cwd = ctx.cwd;
	const workflowDir = join(cwd, "docs", "workflow");
	const projectContext = await getProjectContextBlock(cwd);
	const { subcommand, taskName, topic } = parseArgs(args);

	switch (subcommand) {
		case "list":
			return listTasks(workflowDir);
		case "next":
		return generateNextTask(workflowDir, projectContext, topic);
		case "done":
			return markDone(workflowDir, taskName, projectContext);
		case "help":
		default:
			return taskHelpPrompt;
	}
}
