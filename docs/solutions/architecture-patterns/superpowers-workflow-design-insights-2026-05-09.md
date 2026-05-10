---
title: "Superpowers 对 workflow 设计的五个改进启发"
date: 2026-05-09
category: architecture-patterns
module: .omp/commands
problem_type: architecture_pattern
component: workflow
severity: high
applies_when:
  - "迭代 /explore /task /compound 命令的 prompt 或行为逻辑"
  - "设计 skill 自动触发或硬门控机制"
  - "改进任务验证、计划自审、子代理执行流程"
tags:
  - superpowers
  - skill-triggering
  - hard-gate
  - two-stage-review
  - plan-self-audit
---

# Superpowers 对 workflow 设计的五个改进启发

## Context

对比 Superpowers（`C:/Users/admin/Desktop/ai-agent-source/plugins/superpowers/superpowers-main`）和我们的 workflow 命令系统，发现五个架构差异。Superpowers 的核心设计理念是 **skill 自动触发 + 硬门控 + 两阶段评审 + 计划自审 + 子代理隔离**，而我们的 workflow 依赖用户手动调用 `/explore`、`/task`、`/compound`，没有强制门控，评审只有单阶段验证。

## Guidance

### 1. 硬门控（HARD-GATE）替代建议式引导

Superpowers 的 brainstorming skill 用 `<HARD-GATE>` 标签强制 LLM 不能跳过设计阶段：

```markdown
<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project,
or take any implementation action until you have presented a design and the
user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>
```

`using-superpowers` 进一步强化：

```markdown
<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing,
you ABSOLUTELY MUST invoke the skill. IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT
HAVE A CHOICE. YOU MUST USE IT.
</EXTREMELY-IMPORTANT>
```

我们的 `/explore` 只是"建议先运行"，LLM 可以无视。实际效果：用户说"帮我加个功能"，LLM 直接写代码，跳过场景对齐。

**改进方向：** 在 `_context.md` 的 Rules 段落中加入硬门控指令，格式参照 Superpowers 的 `<HARD-GATE>` XML 标签。例如：

```markdown
## Rules

### explore
<HARD-GATE>
Before writing any code for a new feature or non-trivial change, you MUST run /explore
or confirm with the user that no exploration is needed. Violating this gate means
skipping the most valuable step — exposing assumptions before they become bugs.
</HARD-GATE>
```

优势：不需要改代码，只改 `_context.md`；符合 oh-my-pi 的 "修改此文件后无需重启" 设计；XML 标签在 LLM prompt 中有天然注意力优势。

### 2. 两阶段评审（Spec Compliance → Code Quality）

Superpowers 的 subagent-driven-development 为每个任务执行两阶段评审：

1. **Spec compliance review** — 实现是否匹配计划？有无遗漏或多余？
2. **Code quality review** — 代码质量如何？有无 magic number、重复代码、边界问题？

关键规则：**code quality 评审必须在 spec compliance 通过后才开始**，顺序不能颠倒。

我们的 `/task done` 只有单阶段验证：执行 verify 命令 → 判断 pass/partial/fail。没有检查"实现是否偏离计划"和"代码质量是否合格"。

**改进方向：** 在 task-done.md 中加入两阶段检查提示：

```markdown
### 步骤 1a：Spec Compliance 自检

在运行 verify 命令之前，对照任务的 goal 和 steps 检查：
- 是否所有 steps 都已执行？
- 是否有超出任务范围的额外改动？
- verify 命令是否覆盖了 goal 的核心目标？

### 步骤 1b：Code Quality 自检

在 verify 通过之后，检查：
- 是否有 magic number 或硬编码值？
- 新增代码是否遵循项目既有模式？
- 是否有重复代码需要提取？

如果发现问题，修复后重新验证。
```

这不是子代理级别的评审（oh-my-pi 的子代理机制不同），而是 prompt 层面的自检清单，低成本高收益。

### 3. 计划文档自审（Plan Self-Audit）

Superpowers 的 writing-plans 在计划写完后要求做三项自检：

1. **Spec coverage** — 规格的每个需求都有对应任务吗？
2. **Placeholder scan** — 搜索 TBD、TODO、"implement later"、"add appropriate error handling"等占位符
3. **Type consistency** — 后续任务引用的类型/方法名是否与前面定义的一致？

我们的 task-next.md 没有自审环节。生成的任务可能包含：
- 步骤写"添加错误处理"而非具体代码
- verify 写"测试通过"而非具体命令
- 多个步骤引用的文件路径不一致

**改进方向：** 在 task-next.md 的输出格式之后加入自审段落：

```markdown
### 自审（生成任务后必须执行）

1. **Placeholder scan**：搜索 steps 和 verify 中的 "TBD"、"TODO"、"适当"、"等"——
   如果发现，替换为具体内容
2. **Verify 具体性**：每条 verify 是否都是可执行的终端命令？不是则改写
3. **依赖一致性**：depends_on 引用的 task id 是否都已存在？循环依赖？
```

### 4. Skill 自动触发机制（Session Hook 注入）

Superpowers 的 skill 触发不是靠用户手动调用，而是通过 session-start hook 在会话开始时注入 `using-superpowers` 的完整内容：

```bash
# hooks/session-start
using_superpowers_content=$(cat "${PLUGIN_ROOT}/skills/using-superpowers/SKILL.md")
session_context="<EXTREMELY_IMPORTANT>
You have superpowers.
Below is the full content of your 'superpowers:using-superpowers' skill...
</EXTREMELY_IMPORTANT>"
# 输出为 JSON，注入到 LLM 的 system prompt
```

这意味着 LLM 从第一轮对话就知道 skill 的存在和触发规则，不需要用户提醒。

我们的 workflow 命令只在用户输入 `/explore`、`/task` 时才激活。LLM 不知道它们存在，也不会主动建议使用。

**改进方向：** 利用已有的 `_context.md` 机制（已经自动注入到所有 workflow prompt），在 Rules 段落中声明命令的触发条件。更进一步：如果 oh-my-pi 支持 session-start hook，可以在会话初始化时注入一份精简的 workflow 可用性声明。

### 5. 子代理隔离与模型分级

Superpowers 的 subagent-driven-development 有两个关键设计：

**隔离**：每个任务用全新子代理执行，不继承 session 上下文。子代理只收到精确构造的指令和上下文。

**模型分级**：
- 机械实现（1-2 文件、明确规格）→ 便宜快速模型
- 集成判断（多文件协调、模式匹配）→ 标准模型
- 架构评审 → 最强模型

我们的 `/task done` 在同一 session 内执行所有任务，上下文窗口逐渐被填充，早期任务的信息对后续任务造成噪声。

**改进方向：** 这是长期方向。短期可以在 task-done.md 中加入"上下文清理"提示——完成一个任务后，建议用户开新 session 执行下一个任务，或在对话中总结已完成任务的关键结论。模型分级取决于 oh-my-pi 的子代理 API 是否支持指定模型，暂不实现。

## Why This Matters

当前 workflow 的五个具体缺陷及 Superpowers 的对应解法：

| 缺陷 | 现状 | Superpowers 解法 | 我们可借鉴的方式 |
|------|------|-------------------|-------------------|
| LLM 跳过探索直接实现 | `/explore` 是建议 | `<HARD-GATE>` 硬门控 | `_context.md` 中加 XML 门控标签 |
| 单阶段验证不够 | 只跑 verify 命令 | 两阶段评审（spec → quality） | task-done.md 加自检清单 |
| 任务含占位符 | 无自审 | 计划三查（覆盖/占位符/一致性） | task-next.md 加自审段落 |
| LLM 不知道命令存在 | 用户必须手动调用 | session-start hook 注入 | 扩展 _context.md 或 oh-my-pi hook |
| 上下文污染 | 同 session 全量 | 子代理隔离 + 模型分级 | 长期方向，短期加"新 session"建议 |

## When to Apply

- **立即**：启发 1（硬门控）、2（两阶段评审提示）、3（计划自审）——都是 prompt 层面改动，零代码成本
- **短期**：启发 4（_context.md 扩展或 session hook）——取决于 oh-my-pi 的 hook 支持
- **长期**：启发 5（子代理隔离）——取决于 oh-my-pi 的子代理 API

## Examples

**当前（无门控）：**
```
User: 帮我加个 dark mode
LLM: 好的，我直接改 CSS 和组件...  [跳过 explore，直接实现]
```

**改进后（硬门控）：**
```
User: 帮我加个 dark mode
LLM: 这个改动涉及多个组件和主题系统，我需要先了解项目的主题架构。
     建议运行 /explore 来对齐范围和技术方案。  [受 HARD-GATE 约束，先探索]
```

**当前（单阶段验证）：**
```
/task done → 跑 verify 命令 → pass → 标记完成
[但可能：实现了功能却引入了 magic number，或者多了任务未要求的改动]
```

**改进后（两阶段评审提示）：**
```
/task done → Spec compliance 自检 → Code quality 自检 → 跑 verify → 标记完成
[自检发现问题 → 修复 → 重新验证]
```

## Related

- Superpowers 源码：`C:/Users/admin/Desktop/ai-agent-source/plugins/superpowers/superpowers-main/`
- Superpowers brainstorming skill：`skills/brainstorming/SKILL.md`（HARD-GATE 机制）
- Superpowers subagent-driven-development：`skills/subagent-driven-development/SKILL.md`（两阶段评审）
- Superpowers writing-plans：`skills/writing-plans/SKILL.md`（计划自审 + No Placeholders 规则）
- Superpowers using-superpowers：`skills/using-superpowers/SKILL.md`（skill 触发规则）
- Superpowers verification-before-completion：`skills/verification-before-completion/SKILL.md`（证据优先于声明）
- Superpowers session-start hook：`hooks/session-start`（自动注入机制）
- OpenSpec 对 workflow 设计的七个启发：`docs/solutions/architecture-patterns/openspec-workflow-design-insights-2026-05-09.md`
