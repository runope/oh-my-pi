import type { GitCommit } from "./types";

/**
 * 构建用于发送给 LLM 的提交列表提示
 */
export function buildCommitListPrompt(commits: GitCommit[]): string {
	const lines = commits.map((c, i) => `${i + 1}. ${c.shortHash} - ${c.message}`);

	return `以下是 upstream 的 ${commits.length} 个新提交：

${lines.join("\n")}

请用中文总结这些更新的主要内容，按以下格式输出：

## 📋 更新概要
（一句话概括整体更新方向）

## 🔍 主要变更
（列出 3-5 个最重要的变更）

## ⚠️ 二次开发注意事项
（如果有影响二次开发的变更，请列出）`;
}

/**
 * 构建单个提交的学习提示
 */
export function buildLearnCommitPrompt(commit: GitCommit, diff: string): string {
	return `请详细解读以下 git 提交，帮助开发者理解其技术细节和影响：

**提交信息**
- Hash: ${commit.hash}
- 标题: ${commit.message}
- 作者: ${commit.author}
- 日期: ${commit.date}

**变更文件**
${commit.files.map((f) => `- ${f}`).join("\n")}

**变更统计**
- 添加: ${commit.linesAdded} 行
- 删除: ${commit.linesRemoved} 行

**Diff 摘要**
\`\`\`diff
${diff.slice(0, 5000)}
\`\`\`

请用中文详细解读，格式如下：

## 变更概要
（这个提交做了什么）

## 技术实现
（关键技术点，2-4 条）

## 代码示例
（如果有重要的代码变更，展示片段并解释）

## 影响分析
- **重要程度**: 高/中/低
- **影响模块**: ...
- **相关文件**: ...
- **二次开发注意**: ...`;
}
