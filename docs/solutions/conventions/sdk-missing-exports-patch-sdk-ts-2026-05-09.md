---
title: "SDK 缺少类型导出时在 sdk.ts 中补导出而非从内部路径导入"
date: 2026-05-09
category: conventions
module: packages/coding-agent
problem_type: convention
component: sdk
severity: medium
applies_when:
  - "Custom Command 或 Extension 需要使用 SDK 中未导出的类型"
  - "发现 HookCommandContext、ExecOptions 等类型不在 SDK 导出中"
tags:
  - sdk
  - type-exports
  - hook-command-context
---

# SDK 缺少类型导出时在 sdk.ts 中补导出而非从内部路径导入

## Context

oh-my-pi 的 SDK 入口是 `packages/coding-agent/src/sdk.ts`，Custom Command 通过 `import type { ... } from "@oh-my-pi/pi-coding-agent"` 获取类型。如果需要的类型不在 sdk.ts 的导出中，可能需要从内部路径导入——但这很脆弱。

## Guidance

在 `packages/coding-agent/src/sdk.ts` 中补上缺失的导出，然后从 SDK 导入。

```typescript
// 正确：从 SDK 导入
import type { HookCommandContext, ExecOptions, ExecResult } from "@oh-my-pi/pi-coding-agent";

// 错误：从内部路径导入——脆弱，可能随版本变化
import type { HookCommandContext } from "pi-coding-agent/src/extensibility/custom-commands/types";
```

补导出的方式：
```typescript
// packages/coding-agent/src/sdk.ts
export type { HookCommandContext, ExecOptions, ExecResult } from "./extensibility/custom-commands/types";
```

## Why This Matters

内部路径不是稳定接口——文件移动、重命名、重构都会破坏从内部路径导入的代码。SDK 导出是公共接口，有稳定性保证。Custom Command 和 Extension 作为外部代码，应只依赖 SDK。

## When to Apply
- 发现 Custom Command 需要的类型不在 `@oh-my-pi/pi-coding-agent` 导出中
- 发现 Extension 需要的类型不在 SDK 导出中

## Examples

本次实现中，`HookCommandContext`（Custom Command execute 的 ctx 参数类型）、`ExecOptions`、`ExecResult` 三个类型未在 sdk.ts 中导出。在 sdk.ts 中添加了 `export type { HookCommandContext, ExecOptions, ExecResult } from "./extensibility/custom-commands/types";`。

## Related
- 源码：`packages/coding-agent/src/sdk.ts`
