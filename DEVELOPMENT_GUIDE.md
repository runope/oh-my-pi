# 开发指南

本文档说明如何启动和开发 oh-my-pi 项目。

## 前置要求

- **Bun** >= 1.3.7（推荐使用 `bun@1.3.13`）
- **Node.js**（可选，某些工具可能需要）
- **Rust**（如果需要开发原生模块 `crates/pi-natives`）

### 安装 Bun

```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS/Linux
curl -fsSL https://bun.sh/install | bash
```

---

## 快速开始

### 1. 安装依赖

```bash
# 安装依赖并链接本地包（推荐）
bun install:dev

# 或者只安装依赖
bun install
```

### 2. 启动开发模式

```bash
# 启动 CLI
bun dev

# 或直接运行入口文件
bun packages/coding-agent/src/cli.ts
```

### 3. 检查代码

```bash
# 检查 TypeScript + Rust
bun check

# 只检查 TypeScript
bun check:ts

# 只检查 Rust
bun check:rs
```

---

## 项目结构

这是一个 **monorepo**，使用 Bun workspaces 管理：

```
oh-my-pi/
├── packages/
│   ├── coding-agent/    # 主 CLI 应用（主要开发目标）
│   ├── ai/              # 多提供商 LLM 客户端
│   ├── agent/           # Agent 运行时
│   ├── tui/             # 终端 UI 库
│   ├── natives/         # 原生绑定（文本/图像/grep 操作）
│   ├── stats/           # 本地可观测性仪表板
│   └── utils/           # 共享工具
├── crates/
│   └── pi-natives/      # Rust 原生模块
└── scripts/             # 构建和发布脚本
```

**主要开发目录：** `packages/coding-agent/`

---

## 常用命令

### 开发

| 命令 | 说明 |
|------|------|
| `bun dev` | 启动 CLI（交互模式） |
| `bun stats` | 启动 stats 仪表板 |
| `bun install:dev` | 安装依赖并链接本地包 |

### 代码质量

| 命令 | 说明 |
|------|------|
| `bun check` | 检查所有（TypeScript + Rust） |
| `bun check:ts` | Biome 检查 + TypeScript 类型检查 |
| `bun check:rs` | Cargo fmt --check + clippy |
| `bun lint` | Lint 所有代码 |
| `bun lint:ts` | Biome lint |
| `bun lint:rs` | Cargo clippy |
| `bun fmt` | 格式化所有代码 |
| `bun fmt:ts` | Biome format |
| `bun fmt:rs` | Cargo fmt |
| `bun fix` | 自动修复所有问题 |

### 测试

| 命令 | 说明 |
|------|------|
| `bun test` | 运行所有测试 |
| `bun test:ts` | 运行 TypeScript 测试 |
| `bun test:rs` | 运行 Rust 测试 |
| `bun test test/specific.test.ts` | 运行特定测试文件 |

### 构建

| 命令 | 说明 |
|------|------|
| `bun build` | 构建所有包 |
| `bun build:native` | 构建原生模块 |

---

## 架构概览

### 启动流程

```
cli.ts (runCli)
    │
    ▼
commands/* (launch, shell, ssh, ...)
    │
    ▼
main.ts (runRootCommand)
    │  初始化 theme/settings/models/session
    ▼
createAgentSession(...)
    │
    ├── runInteractiveMode(...)  -> InteractiveMode (TUI)
    ├── runPrintMode(...)        -> 一次性输出
    └── runRpcMode(...)          -> JSONL stdin/stdout
```

### 目录结构（packages/coding-agent/src/）

```
src/
├── cli.ts              # CLI 入口点
├── main.ts             # 应用编排
├── index.ts            # SDK 导出
├── cli/                # 命令行参数和命令适配器
├── commands/           # 具体命令处理器（launch, shell, ssh...）
├── modes/              # 交互/打印/RPC 运行时 + UI 控制器
├── session/            # AgentSession、持久化、存储、压缩
├── tools/              # 内置工具实现（read, bash, edit, write...）
├── task/               # 子代理/任务编排
├── capability/         # 能力定义和 schema
├── discovery/          # 提供商发现模块
├── extensibility/      # 扩展、钩子、自定义工具/命令
├── mcp/                # MCP 传输/管理器/工具桥接
├── lsp/                # 语言服务器客户端/运行时集成
├── internal-urls/      # 协议路由器（agent://, docs://, rule://...）
├── web/                # 搜索提供商 + 域抓取器
├── patch/              # 编辑/补丁解析器 + 应用器
└── config/             # 设置配置
```

---

## 开发工作流

### 1. 创建功能分支

```bash
# 确保在 dev 分支
git checkout dev

# 创建功能分支
git checkout -b feature/my-feature
```

### 2. 开发

```bash
# 启动开发服务器（自动重载）
bun dev

# 在另一个终端监控类型错误
bun check:ts --watch
```

### 3. 测试

```bash
# 运行相关测试
bun test test/path/to/test.test.ts

# 运行所有测试
bun test
```

### 4. 代码检查

```bash
# 检查并自动修复
bun fix

# 手动检查
bun check
```

### 5. 提交

```bash
git add .
git commit -m "feat: add my feature"
```

---

## 调试

### 查看日志

日志文件位置：`~/.omp/logs/omp.YYYY-MM-DD.log`

```bash
# 实时查看日志
tail -f ~/.omp/logs/omp.$(date +%Y-%m-%d).log
```

### 使用 logger

```typescript
import { logger } from "@oh-my-pi/pi-utils";

logger.error("Error message", { context: "data" });
logger.warn("Warning message", { path: "/some/path" });
logger.debug("Debug info", { reason: "something" });
```

**注意：** 不要在 coding-agent 包中使用 `console.log/error/warn`，会破坏 TUI 渲染。

---

## 关键约定

### 代码风格

1. **禁止 `any` 类型**（除非绝对必要）
2. **禁止 `ReturnType<>`** —— 使用实际类型名称
3. **禁止内联导入** —— 使用顶层导入
4. **类字段隐私** —— 使用 ES `#private`，不用 `private` 关键字
5. **Promise** —— 使用 `Promise.withResolvers()` 而非 `new Promise((resolve, reject) => ...)`

### Bun vs Node

优先使用 Bun API：

| 操作 | 使用 | 避免 |
|------|------|------|
| 文件读写 | `Bun.file()`, `Bun.write()` | `readFileSync`, `writeFileSync` |
| 进程执行 | `` $`cmd` ``, `Bun.spawn()` | `child_process` |
| 休眠 | `Bun.sleep(ms)` | `setTimeout` promise |
| SQLite | `bun:sqlite` | `better-sqlite3` |
| JSON5 | `Bun.JSON5.parse()` | `json5` 包 |

### Node 模块导入

使用命名空间导入：

```typescript
// ✓ 正确
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ✗ 错误
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
```

---

## 扩展开发

### 自定义工具

在 `packages/coding-agent/src/tools/` 添加新工具：

1. 创建工具类，继承 `Tool` 基类
2. 实现 `schema`、`execute` 方法
3. 在 `tools/index.ts` 导出

### 自定义命令

在 `packages/coding-agent/src/commands/` 添加新命令：

1. 创建命令处理函数
2. 在 `cli.ts` 的 `commands` 表中注册

### MCP 集成

在 `packages/coding-agent/src/mcp/` 扩展 MCP 功能：

- `manager.ts` - MCP 服务器管理
- `loader.ts` - 配置加载
- `tools.ts` - 工具桥接

---

## 构建发布

### 本地构建

```bash
# 构建二进制
bun --cwd=packages/coding-agent run build
```

### 发布

```bash
# 完整发布流程
bun run release
```

发布脚本会：
1. 检查代码质量
2. 更新版本号
3. 更新 CHANGELOG
4. 创建 git tag
5. 发布到 npm

---

## 常见问题

### Q: bun install 失败？

尝试清除缓存：
```bash
bun pm cache rm
rm -rf node_modules
bun install
```

### Q: TypeScript 类型检查错误？

确保使用正确的 TypeScript 版本：
```bash
bun check:ts
```

### Q: 原生模块编译失败？

检查 Rust 环境：
```bash
rustc --version
cargo --version
bun build:native
```

### Q: 如何查看当前使用的模型？

```bash
# 在 omp TUI 中
/model
```

---

## 相关文档

- [AGENTS.md](AGENTS.md) - 开发规则和约定
- [packages/coding-agent/DEVELOPMENT.md](packages/coding-agent/DEVELOPMENT.md) - 详细架构文档
- [GIT_WORKFLOW.md](GIT_WORKFLOW.md) - Git 工作流
- [README.md](README.md) - 项目介绍
