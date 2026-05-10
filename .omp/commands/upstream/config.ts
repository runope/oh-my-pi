import type { UpstreamConfig } from "./types";

/** 默认配置 */
export const DEFAULT_CONFIG: UpstreamConfig = {
	remote: "upstream",
	branch: "main",
	translationMode: "llm",
	outputDir: "./upstream-reports/",
};

/**
 * 加载扩展配置
 * 优先级：.omp/extensions/upstream-summary/config.json > 默认配置
 */
export async function loadConfig(cwd: string): Promise<UpstreamConfig> {
	const configPath = `${cwd}/.omp/extensions/upstream-summary/config.json`;

	try {
		const file = Bun.file(configPath);
		if (await file.exists()) {
			const userConfig = await file.json();
			return { ...DEFAULT_CONFIG, ...userConfig };
		}
	} catch {
		// 配置文件不存在或解析失败，使用默认配置
	}

	return DEFAULT_CONFIG;
}

/**
 * 保存配置
 */
export async function saveConfig(cwd: string, config: UpstreamConfig): Promise<void> {
	const configPath = `${cwd}/.omp/extensions/upstream-summary/config.json`;
	await Bun.write(configPath, JSON.stringify(config, null, 2));
}
