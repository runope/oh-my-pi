import type { CustomCommandFactory } from "@oh-my-pi/pi-coding-agent";
import { execute } from "./commands";

const factory: CustomCommandFactory = () => ({
	name: "task",
	description: "生成、查看、管理渐进式任务",
	execute,
});

export default factory;
