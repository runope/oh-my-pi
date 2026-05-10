---
title: "Custom Command 使用 import with type text + prompt.render 渲染模板"
date: 2026-05-09
category: design-patterns
module: .omp/commands
problem_type: design_pattern
component: custom-commands
severity: medium
applies_when:
  - "Custom Command 需要动态渲染 prompt 模板"
  - "需要根据用户输入或运行时数据生成 LLM prompt"
tags:
  - custom-commands
  - prompt-templates
  - handlebars
  - prompt-render
---

# Custom Command 使用 import with type text + prompt.render 渲染模板

## Context

oh-my-pi 的 coding-agent 内部（system-prompt.ts、agents.ts）使用固定模式渲染 prompt：静态 .md 文件 + `import ... with { type: "text" }` + `prompt.render()` 处理 Handlebars 动态内容。Custom Command 应遵循同一模式。

## Guidance

```typescript
import { prompt } from "@oh-my-pi/pi-utils";
import myTemplate from "../../prompts/workflow/my-template.md" with { type: "text" };

export async function execute(args: string[], ctx: HookCommandContext): Promise<string | undefined> {
    return prompt.render(myTemplate, {
        topic: args.join(" "),
        today: new Date().toISOString().slice(0, 10),
    });
}
```

**不要：**
- 手动 `Bun.file().text()` 读模板然后 `.replace()` 替换占位符
- 用 HTML 注释标记（`<!-- SECTION -->`）做字符串切割和替换
- 在 TypeScript 中拼接 prompt 字符串

## Why This Matters

`prompt.render()` 使用 Handlebars，支持条件渲染、循环、helper。手动 `.replace()` 无法处理这些场景，且容易引入边界 bug（多次替换、特殊字符）。对齐框架模式意味着新命令的模板可以复用框架的 helper 和渲染能力。

## When to Apply
- 所有需要动态内容的 Custom Command prompt
- 任何需要在 prompt 中注入运行时数据（日期、用户输入、文件列表）的场景

## Examples

**Before（手动字符串替换）：**
```typescript
const template = await Bun.file("./prompt.md").text();
const result = template
    .replace("<!-- TOPIC -->", topic)
    .replace("<!-- DATE -->", new Date().toISOString().slice(0, 10));
return result;
```

**After（框架模式）：**
```typescript
import myTemplate from "../../prompts/workflow/my-template.md" with { type: "text" };
return prompt.render(myTemplate, { topic, today: new Date().toISOString().slice(0, 10) });
```

## Related
- 源码：`packages/coding-agent/src/prompts/system/system-prompt.ts`
- 源码：`packages/coding-agent/src/config/prompt-templates.ts`
