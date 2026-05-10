---
title: "pi-natives glob() 在非递归模式下仍匹配子目录文件"
date: 2026-05-09
category: conventions
module: "@oh-my-pi/pi-natives"
problem_type: convention
component: glob
severity: high
applies_when:
  - "使用 pi-natives glob() 扫描目录并期望 * 不跨越目录边界"
  - "在 .omp/commands/ 下放置 .md 文件但不希望其被注册为 slash command"
tags:
  - pi-natives
  - glob
  - slash-command
  - custom-commands
---

# pi-natives glob() 在非递归模式下仍匹配子目录文件

## Context

oh-my-pi 的 slash command loader 用 `glob({ pattern: "*.md", path: ".omp/commands", recursive: false })` 发现 Markdown 命令。在 POSIX glob 语义下，`*` 不匹配 `/`，所以 `*.md` 只应匹配当前目录的 `.md` 文件。但 pi-natives 的 Rust 实现即使 `recursive: false` 也会返回子目录中的 `.md` 文件。

## Guidance

**不要在 `.omp/commands/` 的任何层级放 prompt .md 文件。** 放到 `.omp/prompts/` 目录，通过 `import ... with { type: "text" }` 导入。

```typescript
// 正确：从 .omp/prompts/ 导入，不受 slash command loader 扫描
import myPrompt from "../../prompts/workflow/my-prompt.md" with { type: "text" };

// 错误：放在 commands 目录内，即使嵌套在子目录也会被注册为 slash command
import myPrompt from "./prompts/my-prompt.md" with { type: "text" };
```

## Why This Matters

如果违反，用户会看到 `explore-empty`、`task-done`、`compound-help` 等意料外的 slash command。这些是 prompt 模板，不是命令——被注册后，用户输入 `/explore-empty` 会把原始 Handlebars 模板作为 prompt 发给 LLM，产生混乱输出。

## When to Apply

- 在 `.omp/commands/` 下创建新的 TypeScript 自定义命令时
- 命令需要 prompt 模板文件时
- 任何使用 pi-natives `glob()` 并期望 `*` 不跨越目录边界的场景

## Examples

**错误结构：**
```
.omp/commands/explore/
├── index.ts
├── commands.ts
└── prompts/
    ├── explore.md       ← 被注册为 /explore 命令（覆盖 TS 命令）
    └── explore-empty.md ← 被注册为 /explore-empty 命令
```

**正确结构：**
```
.omp/commands/explore/
├── index.ts
└── commands.ts          ← import from ../../prompts/workflow/explore.md

.omp/prompts/workflow/
├── explore.md           ← 不在 commands/ 下，不会被注册
└── explore-empty.md
```

## Related

- 源码：`packages/coding-agent/src/discovery/builtin.ts`（slash command 加载逻辑，使用 `glob({ extensions: ["md"], recursive: false })`）
