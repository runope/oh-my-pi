# Project Context

> 此文件的内容会被自动注入到所有 workflow 命令的 prompt 中。
> 修改此文件后无需重启——下次执行命令即生效。
> 留空的段落不会注入。

## Tech Stack

- Runtime: Bun
- Language: TypeScript
- Package manager: Bun (bun.lock)

## Testing

- `bun test` — 运行测试
- `bun run check:ts` — TypeScript 类型检查
- `bun run check:rs` — Rust 类型检查（如有 native crate）

## Code Conventions

- No `any` unless absolutely necessary
- No inline imports (`await import()`)
- Barrel exports: `export * from "./module"`
- Class privacy: ES `#private` fields; no `private`/`protected`/`public` keywords
- Prompts: never build in code; use `.md` files + Handlebars
- Logging: `logger` from `@oh-my-pi/pi-utils`, never `console.log`

## Cross-Platform

- Runs on macOS, Linux, AND Windows
- Always use `path.join()` / `path.resolve()` for file paths
- Never assume forward-slash path separators

## Rules

### explore

- 先读 AGENTS.md 和 docs/ 目录了解项目结构，再开始问答
- 优先参考已有文档而非猜测

<HARD-GATE>
Before writing any code for a new feature or non-trivial change, you MUST run /explore
or explicitly confirm with the user that no exploration is needed. "This is simple"
is NOT a valid reason to skip — simple projects are where unexamined assumptions
cause the most wasted work. A 5-minute explore prevents hours of rework.
</HARD-GATE>

### task

- 验证条件必须用具体命令（`bun test path/to/test.ts`），不要写"测试通过"
- 任务大小目标 S/M；L 必须拆分

<HARD-GATE>
Before marking a task done, you MUST run every verify command and record actual
output (exit code + key lines). No completion claims without fresh verification
evidence. "Should work" is not evidence.
</HARD-GATE>

### compound

- 每个文档只记录一个独立洞察（最小粒度原则）
- title 必须命名具体问题，不是分类标签
- What Didn't Work 是最有价值的部分，必须写
- 遇到错误排查、失败方案、架构决策时，直接在当前 session 写 compound 文档（不要 spawn 子代理）
- 触发条件见 `.omp/rules/compound-auto-trigger.md`（已全局注入）
- 文档格式参考 `.omp/prompts/workflow/compound.md`