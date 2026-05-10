# Upstream 更新报告

生成时间: 2026/5/8 19:15:50

## 状态概览

| 项目 | 值 |
|------|----|
| 当前分支 | dev |
| Upstream 分支 | main |
| 本地 HEAD | df07e8a |
| Upstream HEAD | 18006a4 |
| 落后提交 | 17 |
| 领先提交 | 0 |

## Upstream 新提交 (17 个)

### ✨ 新功能 (6)

**a89ec93f2** upgrade brush to 0.5.0
- 日期: 2026-05-08
- 文件: 24 个文件
- 影响: 🟢 无

**7632117de** added a static-import rewriter that converts
- 日期: 2026-05-08
- 文件: `packages/coding-agent/src/eval/js/context-manager.ts`, `packages/coding-agent/test/core/js-executor.test.ts`
- 影响: 🟢 无

**653d8f8a2** added hideThinkingSummary across 流, agent, session payloads
- 日期: 2026-05-07
- 文件: 14 个文件
- 影响: 🟢 无

**5bb44dfaf** aligned read URL selectors with file-style line ranges
- 日期: 2026-05-07
- 文件: `packages/coding-agent/src/prompts/tools/read.md`, `packages/coding-agent/src/tools/fetch.ts`
- 影响: 🟢 无

**68fc5c3da** added configurable multi-system prompts in OpenAI compat
- 日期: 2026-05-07
- 文件: 7 个文件
- 影响: 🟢 无

**d124402cb** added /loop count/duration arg 解析 and budgeting
- 日期: 2026-05-07
- 文件: 6 个文件
- 影响: 🟢 无

### 🐛 修复 (6)

**18006a445** use Shell::env()/env_mut() in windows submodule
- 日期: 2026-05-08
- 文件: `crates/pi-natives/src/shell/windows.rs`
- 影响: 🟢 无

**1384e2f52** drop unused windows_by_handle nightly 功能
- 日期: 2026-05-08
- 文件: `crates/brush-core-vendored/src/lib.rs`
- 影响: 🟢 无

**dce4edb67** correct windows_sys import paths and tokio child handle accessor
- 日期: 2026-05-08
- 文件: `crates/brush-core-vendored/src/processes.rs`
- 影响: 🟢 无

**30038f59e** fixed pipeline stage session detach behavior during launch
- 日期: 2026-05-08
- 文件: `crates/brush-core-vendored/src/commands.rs`, `crates/brush-core-vendored/src/interp.rs`, `crates/pi-natives/src/shell.rs`
- 影响: 🟢 无

**778a3cc91** inherit AGENTS.md search and workspace tree from parent in subagents
- 日期: 2026-05-07
- 文件: `packages/coding-agent/CHANGELOG.md`, `packages/coding-agent/src/sdk.ts`, `packages/coding-agent/src/task/executor.ts`, `packages/coding-agent/src/task/index.ts`, `packages/coding-agent/src/tools/index.ts`
- 影响: 🟢 无

**371a6b998** scrubbed macOS malloc logging env vars at startup
- 日期: 2026-05-07
- 文件: `packages/coding-agent/src/cli.ts`, `packages/utils/src/procmgr.ts`
- 影响: 🟢 无

### ✅ 测试 (1)

**e1c15bd41** align URL line selectors with new bare-number format
- 日期: 2026-05-08
- 文件: `packages/coding-agent/test/tools/fetch-kagi-toggle.test.ts`
- 影响: 🟢 无

### 🔧 杂项 (3)

**70cbb8033** bump version to 14.7.7
- 日期: 2026-05-08
- 文件: 12 个文件
- 影响: 🟢 无

**e50ccb42f** bump version to 14.7.6
- 日期: 2026-05-08
- 文件: 15 个文件
- 影响: 🟢 无

**5bb7b2a61** bump version to 14.7.5
- 日期: 2026-05-07
- 文件: 14 个文件
- 影响: 🟢 无

### 📦 其他 (1)

**69566fd1a** brush 0.5 base
- 日期: 2026-05-08
- 文件: 166 个文件
- 影响: 🟢 无


---

## 模块影响统计

| 模块 | 变更文件数 | 提交数 | 重要性 |
|------|-----------|--------|--------|
| packages/coding-agent | 15 | 11 | 🟢 低 |
| crates/brush-core-vendored | 15 | 5 | 🟢 低 |
| packages/ai | 15 | 5 | 🟢 低 |
| crates/pi-natives | 15 | 4 | 🟢 低 |
| Cargo.lock | 15 | 4 | 🟢 低 |
| packages/agent | 15 | 4 | 🟢 低 |
| packages/utils | 15 | 4 | 🟢 低 |
| Cargo.toml | 15 | 3 | 🟢 低 |
| bun.lock | 15 | 3 | 🟢 低 |
| package.json | 15 | 3 | 🟢 低 |
| packages/natives | 15 | 3 | 🟢 低 |
| packages/stats | 15 | 3 | 🟢 低 |
| packages/swarm-extension | 15 | 3 | 🟢 低 |
| packages/tui | 15 | 3 | 🟢 低 |
| crates/brush-builtins-vendored | 15 | 2 | 🟢 低 |

---

## 二次开发建议


1. **同步上游更新**:
   ```bash
   git fetch upstream
   git checkout main
   git rebase upstream/main
   git push origin main
   ```

2. **同步开发分支**:
   ```bash
   git checkout dev
   git rebase main
   git push origin dev --force-with-lease
   ```
