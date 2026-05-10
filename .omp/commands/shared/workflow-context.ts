/**
 * Shared workflow context loader
 *
 * Loads project context from .omp/prompts/workflow/_context.md
 * and injects it into all workflow command prompts.
 * The file is optional — missing or empty means no context injection.
 */

import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Cache the context for the session (file is small, read once)
let cachedContext: string | null = null;

/**
 * Load project context from .omp/prompts/workflow/_context.md
 * Returns empty string if file doesn't exist or is empty.
 */
export async function loadProjectContext(cwd: string): Promise<string> {
	if (cachedContext !== null) return cachedContext;

	const contextPath = join(cwd, ".omp", "prompts", "workflow", "_context.md");

	if (!existsSync(contextPath)) {
		cachedContext = "";
		return "";
	}

	try {
		const content = await readFile(contextPath, "utf-8");
		// Strip the first line if it's just a heading like "# Project Context"
		const lines = content.split("\n");
		const startIdx = lines[0]?.startsWith("# ") ? 1 : 0;
		const body = lines.slice(startIdx).join("\n").trim();

		// Skip if only comments/empty lines remain
		const hasContent = body.split("\n").some(
			line => line.trim() && !line.trim().startsWith(">")
		);

		cachedContext = hasContent ? body : "";
		return cachedContext;
	} catch {
		cachedContext = "";
		return "";
	}
}

/**
 * Format project context for injection into prompts.
 * Returns empty string if no context — the prompt template
 * should use {{#if projectContext}} to conditionally render.
 */
export async function getProjectContextBlock(cwd: string): Promise<string> {
	const ctx = await loadProjectContext(cwd);
	if (!ctx) return "";

	return `<context>\n${ctx}\n</context>`;
}

// ─── DAG definitions for each workflow command ──────────────────────────────

export interface WorkflowNode {
	/** Command name (e.g. "explore", "task", "compound") */
	id: string;
	/** What this command produces */
	produces: string;
	/** What must exist before this command can be used */
	requires: string[];
	/** What becomes available after this command succeeds */
	enables: string[];
}

/**
 * Workflow DAG definition.
 * Each node declares what it requires (enablers) and what it enables (unlocks).
 * Dependencies are enablers, not gates — you can run any command anytime,
 * but the DAG tells you what context is available.
 */
export const WORKFLOW_DAG: WorkflowNode[] = [
	{
		id: "explore",
		produces: "场景对齐 + 关键技术文档 (docs/workflow/scene-alignment.md, key-technologies.md)",
		requires: [],
		enables: ["task"],
	},
	{
		id: "task",
		produces: "渐进式任务 (docs/workflow/tasks/task-NN-*.yaml)",
		requires: [],
		enables: ["compound"],
	},
	{
		id: "compound",
		produces: "经验沉淀文档 (docs/solutions/)",
		requires: [],
		enables: [],
	},
];

/**
 * Check what workflow artifacts exist in the project.
 * Returns a map of artifact type → whether it exists.
 */
export function detectWorkflowState(workflowDir: string): Record<string, boolean> {
	const state: Record<string, boolean> = {};

	// Check scene-alignment.md
	state["scene-alignment"] = existsSync(join(workflowDir, "scene-alignment.md"));

	// Check key-technologies.md
	state["key-technologies"] = existsSync(join(workflowDir, "key-technologies.md"));

	// Check tasks directory
	const tasksDir = join(workflowDir, "tasks");
	if (existsSync(tasksDir)) {
		try {
			state["tasks"] = readdirSync(tasksDir).some(f => f.endsWith(".yaml") || f.endsWith(".yml"));
		} catch {
			state["tasks"] = false;
		}
	} else {
		state["tasks"] = false;
	}

	// Check solutions directory
	const solutionsDir = join(workflowDir, "..", "solutions");
	if (existsSync(solutionsDir)) {
		state["solutions"] = collectMdFiles(solutionsDir).length > 0;
	} else {
		state["solutions"] = false;
	}

	return state;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function collectMdFiles(dir: string): string[] {
	const results: string[] = [];
	try {
		function walk(d: string) {
			if (!existsSync(d)) return;
			for (const entry of readdirSync(d, { withFileTypes: true })) {
				const full = join(d, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith(".md")) results.push(full);
			}
		}
		walk(dir);
	} catch {
		// ignore
	}
	return results;
}
