import type { CustomCommandFactory } from "@oh-my-pi/pi-coding-agent";
import { execute } from "./commands";

const factory: CustomCommandFactory = () => ({
	name: "explore",
	description: "头脑风暴：探索对齐场景和关键技术",
	execute,
});

export default factory;
