import type { CustomCommandFactory } from "@oh-my-pi/pi-coding-agent";
import { execute } from "./commands";

const factory: CustomCommandFactory = () => ({
	name: "upstream",
	description: "查看 upstream 更新摘要（中文）— status, diff, report, learn, config, help",
	execute,
});

export default factory;
