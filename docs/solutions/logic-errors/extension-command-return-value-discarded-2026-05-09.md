---
title: "Extension Command 返回值被框架丢弃"
date: 2026-05-09
category: logic-errors
module: extensibility
problem_type: logic_error
component: extension-commands
severity: critical
symptoms:
  - "slash command 执行后界面一直显示 Working... 不会结束"
  - "Extension Command handler 执行成功但 LLM 收不到结果"
  - "Extension Command 中 return 的字符串未出现在后续对话中"
root_cause: wrong_api
resolution_type: migration
tags:
  - extension-command
  - custom-command
  - return-value
  - working-hang
---

# Extension Command 返回值被框架丢弃

## Problem

Extension Command 的 handler 返回 `Promise<void>`，框架调用后直接丢弃返回值。如果 handler 产生的结果需要作为 prompt 发送给 LLM，Extension Command 机制无法实现——命令执行后 LLM 不知道结果，界面卡在 "Working..."。

## Symptoms
- `/command` 执行后界面一直显示 "Working..."
- Extension Command handler 内部逻辑正常执行（日志确认），但 LLM 后续响应完全不知道命令结果
- handler 中 `return "result string"` 的值未被使用

## What Didn't Work
- **在 handler中调用 `ctx.agent.send()`** — 没有此 API
- **把结果写入文件让 LLM 自己读** — 不可靠，LLM 不知道去读
- **修改框架让 Extension Command 返回 string** — 用户选择不改框架

## Solution

迁移到 Custom Command 机制。Custom Command 的 `execute()` 返回 `Promise<string | void>`，返回的字符串会作为 prompt 发送给 LLM。

**Before（Extension Command — 返回值被丢弃）：**
```typescript
// .omp/extensions/my-ext/index.ts
pi.registerCommand("my-cmd", {
    description: "My command",
    handler: async (args, ctx) => {
        const result = await doWork(args);
        return result; // ← 返回值被丢弃！LLM 永远看不到
    },
});
```

**After（Custom Command — 返回值作为 prompt）：**
```typescript
// .omp/commands/my-cmd/index.ts
import type { CustomCommand, HookCommandContext } from "@oh-my-pi/pi-coding-agent";

export default {
    name: "my-cmd",
    description: "My command",
    async execute(args: string[], ctx: HookCommandContext): Promise<string | undefined> {
        const result = await doWork(args);
        return result; // ← 字符串作为 prompt 发送给 LLM
    },
} satisfies CustomCommand;
```

## Why This Works

oh-my-pi 的命令分发机制中，Extension Command 和 Custom Command 的返回值处理方式不同：
- Extension Command handler 签名是 `() => Promise<void>`，框架不使用返回值
- Custom Command execute 签名是 `() => Promise<string | void>`，框架将返回的字符串注入到 LLM 对话流中

这是设计层面的区别，不是 bug。Extension Command 用于副作用（注册工具、修改配置），Custom Command 用于产生 LLM 可消费的内容。

## Prevention
- 需要命令结果作为 LLM prompt 的场景，直接使用 Custom Command
- Extension Command 只用于副作用：`pi.registerTool()`、`pi.registerHook()` 等
- 在创建命令前确认返回值需求，选择正确的机制

## Related
- 源码：`packages/coding-agent/src/session/agent-session.ts`（`prompt()` 方法中的命令分发优先级）
- 源码：`packages/coding-agent/src/extensibility/custom-commands/types.ts`（CustomCommand 类型定义）
