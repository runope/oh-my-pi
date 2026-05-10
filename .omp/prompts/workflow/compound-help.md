> 工作流: /explore → /task next → /task done → /compound（可从任意步骤开始，不需按顺序）

## /compound — 经验沉淀

**核心理念：** 知识复利。第一次解决问题花 30 分钟研究，记录后下次只需 2 分钟。Knowledge compounds.

**不适用：** 问题未解决、修复方案未验证、或只是简单拼写错误。

### 用法

| 命令 | 说明 |
|---|---|
| `/compound` | 沉淀最近解决的问题（交互式选择 track） |
| `/compound bug` | 直接进入 Bug track |
| `/compound knowledge` | 直接进入 Knowledge track |
| `/compound pi-natives glob 匹配子目录文件` | 指定主题——聚焦于特定问题 |
| `/compound bug extension 返回值被丢弃` | 指定 track + 主题 |
| `/compound --auto` | 自动触发（由 /task done 调用） |
| `/compound help` | 显示帮助 |

### 双轨制

| Track | 用途 | problem_type 示例 |
|---|---|---|
| **Bug** 🐛 | 诊断修复过的问题 | `build_error`, `test_failure`, `runtime_error`, `performance_issue`, `logic_error`, `integration_issue` |
| **Knowledge** 💡 | 提炼经验和模式 | `architecture_pattern`, `design_pattern`, `tooling_decision`, `convention`, `best_practice`, `developer_experience` |

### 输出位置

`docs/solutions/[category]/[slug]-[date].md`

分类由 problem_type 自动决定。例如：
- `build_error` → `docs/solutions/build-errors/`
- `design_pattern` → `docs/solutions/design-patterns/`
- `convention` → `docs/solutions/conventions/`

### 重叠检测

创建文档前会检查 `docs/solutions/` 中已有文档。按 5 个维度（问题描述、根因、方案、引用文件、防范规则）评估重叠度——高重叠时更新现有文档而非重复创建。

### Quick vs Full

- **Quick**（默认）：从当前对话上下文提取，直接输出
- **Full**：额外搜索相关代码和文档，补充引用。适合复杂或跨模块的问题

### 常见自我辩解

| 借口 | 反驳 |
|---|---|
| "经验不重要，下次再遇到时再排查" | 每次排查 30 分钟，记录后下次 2 分钟。不记录的经验是沉没成本。 |
| "问题太简单，不值得记录" | 简单问题的根因可能不简单。5 分钟记录省掉下次 30 分钟重走弯路。 |
| "先做下一个任务，compound 以后再说" | 记忆衰减很快。2 小时后细节模糊，1 天后只能写出泛泛的总结。现在记录最准确。 |
