import type { CustomCommandFactory } from "@oh-my-pi/pi-coding-agent";
import { execute } from "./commands";

const factory: CustomCommandFactory = () => ({
	name: "workflow",
	description: "查看工作流整体状态",
	execute,
});

export default factory;
