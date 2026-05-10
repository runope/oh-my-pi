> 工作流: /explore → /task next → /task done → /compound（可从任意步骤开始，不需按顺序）

## /task — 任务管理

基于场景对齐和技术文档（如有），或当前对话上下文，生成渐进式、可验证的任务。

### 生命周期

`/task next` → 工作 → `/task done` → （可选 `/compound --auto`）

每个任务独立完成、独立验证、独立 commit。

### 子命令

| 命令 | 说明 |
|---|---|
| `/task` 或 `/task list` | 查看任务列表及状态 |
| `/task next` | 基于上下文生成下一个渐进式任务 |
| `/task next 清理 debug 日志` | 带方向生成任务——聚焦于指定主题 |
| `/task 清理 debug 日志` | 简写——等同于 `/task next 清理 debug 日志` |
| `/task done` | 完成当前任务：验证 → commit → achive → 可选 compound |
| `/task done task-01-xxx` | 完成指定任务 |
| `/task help` | 显示帮助 |

### 任务规格

- **文件位置**：`docs/workflow/tasks/task-NN-slug.yaml`
- **依赖**：`depends_on` 字段声明前置任务，确保执行顺序
- **验证**：每个任务必须包含 `verify:` 条件（命令或断言），通过后才算完成
- **大小**：一个任务应在一个 session 内完成。如果估计超过一个上下文窗口，拆分为多个小任务

### 大小参考

- **S**：单文件改动，验证明确（如修复一个 lint 错误）
- **M**：2-5 个文件，需要理解上下文（如添加一个 API 端点）
- **L**：跨模块改动，需要设计决策（应拆分为多个 M 任务）
