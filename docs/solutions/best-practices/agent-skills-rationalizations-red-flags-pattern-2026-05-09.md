---
title: "Prompt 设计中引入 agent-skills 的 Rationalizations/Red Flags/When NOT to Use 模式"
date: 2026-05-09
category: best-practices
module: ".omp/prompts"
problem_type: best_practice
component: prompt-design
severity: medium
applies_when:
  - "设计 LLM 驱动的工作流命令的 prompt"
  - "编写 SKILL.md 或类似的指令型 prompt"
  - "LLM 容易跳过步骤或走捷径的流程"
tags:
  - prompt-design
  - agent-skills
  - rationalizations
  - red-flags
---

# Prompt 设计中引入 agent-skills 的 Rationalizations/Red Flags/When NOT to Use 模式

## Context

agent-skills 插件的每个 SKILL.md 都包含三个固定段落：Common Rationalizations（借口反驳表）、Red Flags（流程违反信号）、When NOT to Use（排除条件）。这些段落直接对抗 LLM 在执行结构化流程时的两个倾向：跳过步骤和过度泛化。

## Guidance

在工作流命令的 prompt 中加入以下段落：

### 1. Common Rationalizations（借口反驳表）

表格形式列出 LLM 可能用来跳过步骤的借口，以及为什么这个借口不成立：

```markdown
| 借口 | 反驳 |
|------|------|
| "问题很简单，不需要完整流程" | 简单问题的完整流程耗时 <2 分钟，但跳过步骤导致的错误排查耗时 >30 分钟 |
| "已经确认没有重叠文档" | 未经搜索的确认不算确认 |
```

### 2. Red Flags（流程违反信号）

列出可观察到的违反信号，让 LLM 自检：

```markdown
- 跳过了重叠检测就直接写文档
- Prevention 部分是空话（"注意避免"）而非具体措施
- 没有搜索 docs/solutions/ 就声称无重叠
```

### 3. When NOT to Use（排除条件）

明确命令不适用的场景：

```markdown
- 问题仍在排查中且没有可验证的结论 → 不适合 compound
- 简单的拼写错误修复 → 不值得记录
```

### 4. Lifecycle Note

在每个命令 prompt 顶部显示完整工作流路径：

```markdown
> 工作流: /explore → /task next → /task done → /compound
```

## Why This Matters

没有这些段落，LLM 经常：
- 跳过重叠检测直接写文档（"我确认没有重叠"）
- Prevention 写空话（"注意避免此类问题"）
- 在不适合的场景使用命令（进行中的问题、琐碎修复）

加入后，这些行为在 prompt 层面就被约束，而不是靠 LLM 自行判断。

## When to Apply
- 设计多步骤工作流的 prompt 时
- 流程中存在容易被跳过的关键步骤时
- 命令有明确的适用/不适用边界时

## Examples

**Before（无约束的 prompt）：**
```markdown
### 步骤 4：重叠检测
检查 docs/solutions/ 是否已有类似文档。
```

**After（有约束的 prompt）：**
```markdown
### 步骤 4：重叠检测（Full 模式）

> ⚠️ 跳过此步骤是最常见的错误。未经搜索的"确认无重叠"不算确认。

| 借口 | 反驳 |
|------|------|
| "这是一个新问题" | 新问题也可能与旧问题有相同根因 |
| "已经确认没有重叠" | 搜索了吗？用什么关键词？ |

**Red Flags（自检）：**
- [ ] 没有执行 grep 搜索就写文档
- [ ] 只搜了一个关键词
- [ ] 找到候选文档但只读了标题没读内容
```

## Related
- 参考：agent-skills 的 `skills/*/SKILL.md`（每个 skill 都包含 Common Rationalizations、Red Flags、When NOT to Use）
- 参考：compound-engineering 的 `ce-compound/SKILL.md`（双执行模式、五维度重叠检测）
