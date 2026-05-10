# Extension Command vs Custom Command

 omp 提供两种可编程的 slash command 机制。选错会导致命令"静默失败"——handler 执行了，但返回值被丢弃，UI 一直显示 "Working..."。

## 快速判断

| 你想做什么 | 用哪种机制 |
|---|---|
| 命令执行后**返回结果给 LLM 处理** | **Custom Command** |
| 命令执行**纯副作用**（UI 操作、会话控制、直接显示通知） | **Extension Command** |

## 两种机制对比

| | Extension Command | Custom Command |
|---|---|---|
| 注册方式 | `pi.registerCommand("name", { handler })` | `export default (api) => ({ name, execute })` |
| Handler 签名 | `(args: string, ctx) => Promise<void>` | `(args: string[], ctx) => Promise<string \| void>` |
| **返回值** | **被忽略** | **string 发送给 LLM，void 不发送** |
| Args 类型 | `string`（原始字符串，如 `"status --verbose"`） | `string[]`（已解析数组，如 `["status", "--verbose"]`） |
| 上下文类型 | `ExtensionCommandContext`（含 `newSession`, `branch`, `switchSession`） | `HookCommandContext`（含 `ui`, `exec`, `cwd`） |
| 依赖注入 | `pi.typebox`, `pi.pi` | `api.typebox`, `api.exec` |
| 执行时机 | 立即执行（即使在 streaming 中也会执行） | 立即执行 |
| 所在目录 | `.omp/extensions/<name>/index.ts` | `.omp/commands/<name>/index.ts` 或 `~/.omp/commands/` |
| 典型用途 | 切换会话、compact、刷新 UI、toggle 模式 | 生成报告、查询信息、构造 prompt 给 LLM 总结 |

## 执行流程

```
用户输入 "/my-command args"
  │
  ├─① Extension Command (#tryExecuteExtensionCommand)
  │   找到 → 执行 handler → 返回 true（忽略 handler 返回值）→ prompt() 结束
  │   没找到 → 继续
  │
  ├─② Custom Command (#tryExecuteCustomCommand)
  │   找到 → 执行 execute → 返回 string?
  │     string 非空 → 替换 prompt text → 发送给 LLM
  │     string 为空 / void → prompt() 结束
  │   没找到 → 继续
  │
  ├─③ File-based slash command (expandSlashCommand)
  │   markdown 模板展开
  │
  └─④ 发送给 LLM
```

**关键**：Extension Command 的 handler 返回值被**完全丢弃**。如果你需要把结果发给 LLM，必须使用 Custom Command。

## Extension Command 示例

用于纯副作用场景（UI 操作、会话控制）：

```ts
// .omp/extensions/my-ext/index.ts
import type { ExtensionFactory } from "@oh-my-pi/pi-coding-agent";

const factory: ExtensionFactory = (pi) => {
  pi.registerCommand("toggle-theme", {
    description: "Toggle light/dark theme",
    handler: async (_args, ctx) => {
      // 纯副作用：操作 UI，不返回任何值
      ctx.ui.notify("Theme toggled", "info");
      // handler 返回值被忽略，即使写了 return "xxx" 也不会发送给 LLM
    },
  });
};

export default factory;
```

## Custom Command 示例

用于需要返回结果给 LLM 的场景：

```ts
// .omp/commands/git-status/index.ts
import type { CustomCommandFactory } from "@oh-my-pi/pi-coding-agent";

const factory: CustomCommandFactory = (api) => ({
  name: "git-status",
  description: "Show git status and let LLM suggest actions",
  async execute(args, ctx) {
    const result = await api.exec("git", ["status", "--porcelain"]);
    if (result.code !== 0) {
      return `Git status failed:\n${result.stderr}`;
    }
    // 返回 string → 发送给 LLM
    return `Here's the git status:\n\`\`\`\n${result.stdout}\`\`\`\nSuggest what to do next.`;
  },
});

export default factory;
```

## 常见错误

### 错误：在 Extension Command 中期望返回值被发送给 LLM

```ts
// ❌ 错误用法
pi.registerCommand("my-query", {
  description: "Query something",
  handler: async (_args, ctx) => {
    const data = await fetchData();
    return data.summary;  // 这个返回值被丢弃了！UI 会卡在 "Working..."
  },
});
```

```ts
// ✅ 正确：用 Custom Command
const factory: CustomCommandFactory = (api) => ({
  name: "my-query",
  description: "Query something",
  async execute(args, ctx) {
    const data = await fetchData();
    return data.summary;  // 这个返回值会发送给 LLM
  },
});
```

### 错误：在 Custom Command 中依赖 Extension API

Custom Command 的 `api` 参数和 Extension 的 `pi` 参数提供的 API 不同：
- `api.exec(...)` — 执行 shell 命令
- `api.typebox` — TypeBox 模块
- `api.pi` — pi-coding-agent 导出
- 但**没有** `api.on(...)`, `api.registerTool(...)` 等 Extension 专有方法

### 错误：args 类型不匹配

Extension Command handler 接收 `args: string`（原始字符串）。
Custom Command execute 接收 `args: string[]`（已解析数组）。

```ts
// Extension Command: args 是 string
handler: async (args, ctx) => {
  console.log(args);  // "status --verbose"
}

// Custom Command: args 是 string[]
execute: async (args, ctx) => {
  console.log(args);  // ["status", "--verbose"]
}
```

## 文件位置总结

| 内容 | 位置 |
|---|---|
| Extension 类型定义 | `packages/coding-agent/src/extensibility/extensions/types.ts` |
| Extension 加载器 | `packages/coding-agent/src/extensibility/extensions/loader.ts` |
| Custom Command 类型定义 | `packages/coding-agent/src/extensibility/custom-commands/types.ts` |
| Custom Command 加载器 | `packages/coding-agent/src/extensibility/custom-commands/loader.ts` |
| 命令调度逻辑 | `packages/coding-agent/src/session/agent-session.ts` (`prompt()` 方法) |
| 详细文档 | `docs/extensions.md`, `docs/custom-tools.md`, `docs/slash-command-internals.md` |
