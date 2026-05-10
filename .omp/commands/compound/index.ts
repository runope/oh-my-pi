import type { CustomCommandFactory } from "@oh-my-pi/pi-coding-agent";
import { execute } from "./commands";

const factory: CustomCommandFactory = () => ({
	name: "compound",
	description: "沉淀经验：从问题和决策中提取可复用知识（Bug track + Knowledge track）",
	execute,
});

export default factory;
