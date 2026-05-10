import type { CustomCommandFactory, HookCommandContext } from "@oh-my-pi/pi-coding-agent";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prompt } from "@oh-my-pi/pi-utils";
import { getProjectContextBlock } from "../shared/workflow-context";

/**
 * /explore — 头脑风暴场景对齐和关键技术
 *
 * 提示词导入方式与 system-prompt.ts 一致：
 * import content from "./prompt.md" with { type: "text" }
 * 然后用 prompt.render() 渲染 Handlebars
 */
import explorePrompt from "../../prompts/workflow/explore.md" with { type: "text" };
import exploreEmptyPrompt from "../../prompts/workflow/explore-empty.md" with { type: "text" };

export async function execute(args: string[], ctx: HookCommandContext): Promise<string | undefined> {
	const cwd = ctx.cwd;
	const workflowDir = join(cwd, "docs", "workflow");
	const scenePath = join(workflowDir, "scene-alignment.md");
	const techPath = join(workflowDir, "key-technologies.md");

	const hasScene = existsSync(scenePath);
	const hasTech = existsSync(techPath);
	const topic = args.join(" ").trim();

	if (!topic && !hasScene && !hasTech) {
		return exploreEmptyPrompt;
	}

	let existingContext = "";
	if (hasScene) {
		const content = await readFile(scenePath, "utf-8");
		existingContext += `\n\n## 现有的 scene-alignment.md\n\n${content}`;
	}
	if (hasTech) {
		const content = await readFile(techPath, "utf-8");
		existingContext += `\n\n## 现有的 key-technologies.md\n\n${content}`;
	}

	return prompt.render(explorePrompt, {
		topic: topic || "",
		existingContext,
		projectContext: await getProjectContextBlock(ctx.cwd),
	});
}

const factory: CustomCommandFactory = () => ({
	name: "explore",
	description: "头脑风暴：探索对齐场景和关键技术",
	execute,
});

export default factory;
