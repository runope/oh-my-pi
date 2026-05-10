## /compound — 经验沉淀{{autoTriggerLabel}}
{{projectContext}}


### 核心理念：知识复利

第一次遇到问题，花 30 分钟研究、排查、试错。记录下来后，下次遇到同样的问题只需 2 分钟。

这就是知识复利：每一次记录都是对未来自己的投资。没有记录的经验是沉没成本；有记录的经验是可搜索、可复用的资产。

**目标：** 从当前对话中提取已验证的问题解决方案或经验决策，写入结构化文档，让未来的自己（或队友）能通过搜索直接命中。

---

### 执行模式

根据场景选择模式：

| 模式 | 适用场景 | 步骤 |
|---|---|---|
| **Full** | 默认。首次记录、复杂问题、不确定是否有重叠文档 | 提取 → 重叠检测 → 编写 |
| **Quick** | 简单修复、长会话末尾、明确无重叠 | 提取 → 编写（跳过重叠检测） |

如果会话中只修复了一个小问题且你确信没有重叠文档，使用 Quick 模式。其他情况一律使用 Full 模式。

---

### 步骤 1：选择 Track

根据问题性质选择：

**Bug track** 🐛 — 适用于：
- 诊断并修复了 bug 或错误
- 排查过程有值得记录的弯路
- 问题可能再次发生，需要防范

**Knowledge track** 💡 — 适用于：
- 架构决策或技术选型
- 最佳实践或设计模式
- 工作流改进或团队规范
- 任何「下次遇到类似情况应该怎么做」的经验

{{trackSelection}}

### 前提条件

在开始之前，确认以下条件（advisory，不是强制）：
- 问题已经**解决**（不是进行中）
- 解决方案已经**验证**有效
- 问题**非平凡**（不是简单的拼写错误或显而易见的错误）

如果条件不满足，简要说明原因后跳过。如果问题正在排查中但已有关键发现，也可以记录中间状态——在文档标题中标注 [WIP]。

---

### 步骤 2：分类与 problem_type

确定 `problem_type`，这是分类的锚点。从下面的选项中选择最精确的一个：

### Bug Track problem_type 选项
- `build_error` → `docs/solutions/build-errors/`
- `test_failure` → `docs/solutions/test-failures/`
- `runtime_error` → `docs/solutions/runtime-errors/`
- `performance_issue` → `docs/solutions/performance-issues/`
- `database_issue` → `docs/solutions/database-issues/`
- `security_issue` → `docs/solutions/security-issues/`
- `ui_bug` → `docs/solutions/ui-bugs/`
- `integration_issue` → `docs/solutions/integration-issues/`
- `logic_error` → `docs/solutions/logic-errors/`

### Knowledge Track problem_type 选项
- `architecture_pattern` → `docs/solutions/architecture-patterns/`
- `design_pattern` → `docs/solutions/design-patterns/`
- `tooling_decision` → `docs/solutions/tooling-decisions/`
- `convention` → `docs/solutions/conventions/`
- `workflow_issue` → `docs/solutions/workflow-issues/`
- `developer_experience` → `docs/solutions/developer-experience/`
- `documentation_gap` → `docs/solutions/documentation-gaps/`
- `best_practice` → `docs/solutions/best-practices/`

**分类规则：**
- Bug track 的 problem_type 映射到 `docs/solutions/[category]/` 目录
- Knowledge track 的 problem_type 同样映射到对应目录
- 如果问题跨越多个 type，选最精确的那个；在 tags 中补充其余维度

**文件命名：** `[sanitized-problem-slug]-{{today}}.md`
- slug 使用英文 kebab-case
- 例如：`extension-command-return-value-discarded-2026-05-08.md`

---

### 步骤 3：从对话上下文提取

从当前对话历史中提取问题和解决方案。如果用户提供了额外主题（topic），以此作为切入点。

提取要点：
- **问题本质**：不是表面现象，而是根因（"API 返回值被丢弃"而非"功能不工作"）
- **排查路径**：哪些尝试失败了、为什么失败（这是最有价值的信息）
- **最终方案**：代码级别的 before/after，不是泛泛描述
	- **防范措施**：具体的测试用例、lint 规则、代码规范，而非"注意避免"

**最小粒度原则：** 每个文档只记录一个独立的洞察。如果一个对话中有多个不相关的发现，必须拆成多个文档，每个文档聚焦一个具体问题。

判断是否需要拆分：
- 如果 title 可以写成"X 的踩坑"或"X 的设计模式"——这是分类标签，不是具体洞察。必须追问：什么坑？什么模式？每个答案是一个独立文档。
- 如果文档需要编号（1. 2. 3. ...）来列举多个要点——每个要点大概率应该是一个独立文档。
- 如果两个要点的 tags 和 applies_when/symptoms 几乎不重叠——它们是独立的，应该拆分。
- 如果两个要点共享同一个根因或同一套解决方案——它们可以合并在一个文档中。

{{topicSection}}

---

### 步骤 4：重叠检测（Full 模式）

检查 `docs/solutions/` 是否已有类似文档。这是防止知识碎片化的关键步骤。

#### 4a. 搜索策略

**Grep-first，避免全量读取：**
1. 从提取的上下文中识别 2-3 个关键词（模块名、错误信息、API 名称）
2. 如果 category 已确定，优先搜索 `docs/solutions/[category]/` 子目录
3. 对 frontmatter 字段做定向搜索：`title:`、`problem_type:`、`root_cause:`、`symptoms:`
4. 仅读取候选文档的前 30 行（frontmatter 区域）来判断相关性
5. 仅对初步命中的文档做全量读取

#### 4b. 五维度评分

对每个候选文档，逐维度评估重叠：

| 维度 | 评估内容 | 示例 |
|---|---|---|
| 1. 问题描述 | 核心问题是否相同 | "API 返回值被忽略" ≈ "函数调用结果未使用" |
| 2. 根本原因 | root_cause 是否一致 | 同为 logic_error，同为"缺少空值检查" |
| 3. 解决方案 | 修复方法本质相同 | 同为"添加 await/赋值"，即使具体代码不同 |
| 4. 引用文件 | 涉及相同文件或模块 | 同一文件、同一目录、同一模块 |
| 5. 防范规则 | Prevention 规则重叠 | 同为"添加 lint 规则 XXX" |

#### 4c. 重叠度判定

| 匹配维度 | 重叠度 | 动作 |
|---|---|---|
| 4-5 维度 | **高** | **更新现有文档**：在现有文档中添加新上下文、新症状、新引用文件，frontmatter 中加 `updates` 字段 |
| 2-3 维度 | **中** | 创建新文档，设置 `extends` 字段，两篇文档的 Related 区域互相引用 |
| 0-1 维度 | **低/无** | 创建新文档，不设置增量关系字段 |

{{overlappingDocsSection}}

---

### 步骤 5：编写文档

输出文件：`docs/solutions/[category]/[filename].md`

使用 **Markdown + YAML frontmatter** 格式（不是纯 YAML）。

#### YAML Frontmatter 合约

**两个 track 共享的必填字段：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `title` | string | 问题/经验简述（中文即可） |
| `date` | date | YYYY-MM-DD |
| `category` | string | problem_type 对应的目录名 |
| `module` | string | 受影响的模块或区域 |
| `problem_type` | enum | 从步骤 2 的选项中选择 |
| `component` | string | 涉及的组件 |
| `severity` | enum | `critical` / `high` / `medium` / `low` |
| `tags` | array | 搜索关键词（2-5 个） |

**增量关系字段（可选，用于描述与已有文档的增量关系）：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `updates` | string | 本文档更新了哪篇已有文档的内容（添加新上下文、新症状） |
| `supersedes` | string | 本文档替代了哪篇已有文档（旧文档已过时，本文档是完整替代） |
| `extends` | string | 本文档扩展了哪篇已有文档（从不同角度补充，两篇都保留） |

**增量关系规则：**
- `updates`：高重叠时使用。在现有文档中直接添加新内容，不创建新文件。如果新内容太多导致文档臃肿，考虑 `extends`
- `supersedes`：已有文档完全过时或错误时使用。创建新文档，在旧文档的 frontmatter 中添加 `superseded_by` 指向新文档
- `extends`：中等重叠但视角不同时使用。创建新文档，两篇文档的 Related 区域互相引用
- 不填写这三个字段 = 独立文档（低重叠或无重叠）
- 值为已有文档的相对路径，如 `conventions/pi-natives-glob-matches-subdirectory-files-2026-05-09.md`

**Bug track 额外必填字段：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `symptoms` | array | 可观察到的症状或错误信息 |
| `root_cause` | enum | 见下方枚举值 |
| `resolution_type` | enum | 见下方枚举值 |

**Knowledge track 可选字段（按需添加）：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `applies_when` | array | 适用场景描述 |
| `symptoms` | array | 仅当知识涉及问题时添加 |
| `root_cause` | enum | 仅当知识涉及根因时添加 |
| `resolution_type` | enum | 仅当知识涉及修复方式时添加 |

**`root_cause` 枚举值：**

`missing_association` | `wrong_api` | `config_error` | `logic_error` | `race_condition` | `missing_validation` | `dependency_issue` | `version_mismatch` | `permission_error` | `resource_leak` | `encoding_error` | `timeout` | `circular_dependency` | `side_effect`

**`resolution_type` 枚举值：**

`code_fix` | `migration` | `config_change` | `dependency_update` | `workaround` | `refactor` | `rollback` | `documentation_fix` | `test_addition`

---

#### Bug Track 文档模板

```markdown
---
title: "问题简述"
date: YYYY-MM-DD
category: [problem_type 对应的目录名]
module: [受影响的模块或区域]
problem_type: [build_error | test_failure | runtime_error | ...]
component: [涉及的组件]
severity: [critical | high | medium | low]
symptoms:
  - "可观察到的症状 1"
  - "可观察到的症状 2"
root_cause: [missing_association | wrong_api | config_error | logic_error | ...]
resolution_type: [code_fix | migration | config_change | ...]
tags:
  - keyword-one
  - keyword-two
---

# 问题简述

## Problem
[1-2 句话描述问题和用户可见的影响]

## Symptoms
- [可观察到的症状或错误信息]

## What Didn't Work
- [尝试过的方案及失败原因]

## Solution
[实际修复方案，包含代码示例（before/after）]

## Why This Works
[根本原因解释，为什么这个修复有效]

## Prevention
- [具体的防范策略、测试用例、代码规范]

## Related
- [相关文档或 issue，如果有]
```

**Bug track 写作规则：**
- Problem：1-2 句话，说清楚问题和影响
- Symptoms：可观察到的症状，包含实际错误信息
- What Didn't Work：**必须写**排查弯路，这是最有价值的部分
- Solution：包含代码示例（before/after），不只是描述
- Why This Works：解释根因，不只是「修了」
- Prevention：具体可操作的防范措施（测试用例、lint 规则、代码规范）

**Bug track 写作要点：**
- **Problem**：1-2 句话，说清楚问题和用户可见的影响。不要复述 symptoms，要说本质。
- **Symptoms**：可观察到的症状，包含实际错误信息（堆栈、日志、异常消息）。这是搜索命中的关键。
- **What Didn't Work**：**必须写**。记录排查弯路——失败的尝试、错误的方向、排除的假设。这是未来读者最需要的部分，能避免重复踩坑。
- **Solution**：包含代码示例（before/after），不只是描述"修了什么"。展示关键改动，省略无关细节。
- **Why This Works**：解释根因和修复的因果链。不只是"修了"，而是"为什么这样修有效"。
- **Prevention**：具体可操作的防范措施——测试用例、lint 规则、代码规范、CI 检查。不要写"注意避免"这种空话。

---

#### Knowledge Track 文档模板

```markdown
---
title: "经验简述"
date: YYYY-MM-DD
category: [problem_type 对应的目录名]
module: [受影响的模块或区域]
problem_type: [architecture_pattern | design_pattern | tooling_decision | ...]
component: [涉及的组件]
severity: [critical | high | medium | low]
applies_when:
  - "适用场景 1"
  - "适用场景 2"
tags:
  - keyword-one
  - keyword-two
---

# 经验简述

## Context
[什么情况、缺口或摩擦促成了这个指导]

## Guidance
[具体的实践、模式或建议，包含代码示例]

## Why This Matters
[遵循或不遵循此指导的理由和影响]

## When to Apply
- [适用的条件或场景]

## Examples
[具体的 before/after 或使用示例]

## Related
- [相关文档或 issue，如果有]
```

**Knowledge track 写作规则：**
- Context：说清楚什么情况触发了这个经验
- Guidance：具体的做法，包含代码示例
- Why This Matters：说明遵循和不遵循的后果
- When to Apply：明确适用条件
- Examples：before/after 或具体用例

**Knowledge track 写作要点：**
- **Context**：什么情况、缺口或摩擦促成了这个指导。让读者能快速判断"这是不是跟我遇到的情况一样"。
- **Guidance**：具体的实践、模式或建议，包含代码示例。不要只说"推荐做 X"，要说"做 X 的具体方式是……"。
- **Why This Matters**：遵循此指导的收益，和不遵循的风险。用具体场景说明后果。
- **When to Apply**：明确适用条件。不要写成"任何时候都适用"——那等于没有指导。
- **Examples**：before/after 代码对比或具体用例。让读者能直接复制。

---

### YAML Frontmatter 安全规则

数组字段（symptoms, applies_when, tags, related_components）中的值，如果以以下字符开头，必须用双引号包裹：

`` ` ``, `[`, `*`, `&`, `!`, `|`, `>`, `%`, `@`, `?``

如果值包含 `: ` 子字符串，也必须用双引号包裹。

**示例：**

```yaml
# 错误 — YAML 解析会出错
symptoms:
  - *pointer syntax error
  - key: value in symptom

# 正确
symptoms:
  - "*pointer syntax error"
  - "key: value in symptom"
```

---

### 常见错误

| 错误做法 | 正确做法 |
|---|---|
| 发现重叠文档但仍创建新文档 | 高重叠 → 更新现有文档，添加新上下文 |
| Bug track 文档缺少 What Didn't Work | 这是未来读者最需要的部分——排查弯路比答案更有价值 |
| Knowledge track 文档使用 Bug track 必填字段 | 按 track 要求填写；Knowledge track 的 symptoms/root_cause/resolution_type 是可选的 |
| Prevention 写成"注意避免此类问题" | 写具体的测试用例、lint 规则、代码模式 |
| 文件名用中文 | slug 使用英文 kebab-case |
| frontmatter 中数组值不引特殊字符 | 遵循上面的 YAML 安全规则 |
| 根因写成"代码有 bug" | 使用 root_cause 枚举值，在 Why This Works 中解释细节 |
| 记录进行中的问题但不标注 | 在标题中加 [WIP]，说明当前状态和未验证部分 |
| 多个不相关洞察合并在一个文档中，title 写成"X 的踩坑"/"X 的设计模式" | 每个独立洞察一个文档；title 必须命名具体问题，不是分类标签 |

---

### 步骤 6：可发现性检查

检查项目的 AGENTS.md 是否提到了 `docs/solutions/` 知识库。如果没有，在最合适的位置加一行说明（不要创建新 section 除非必要）：

```
docs/solutions/  # 已记录的问题解决方案（bug、最佳实践、工作流模式），按分类组织，YAML frontmatter 可搜索
```

---

### 步骤 7：Commit

```bash
git add docs/solutions/
git commit -m "docs: compound {简短标题}"
```

{{currentTaskSection}}

### 完成

输出总结：

```
Documentation complete

File: docs/solutions/[category]/[filename].md
Track: [bug/knowledge] | Type: [problem_type] | Severity: [severity]
[如果产生了多个文档：列出每个文件的 File / Track / Type / Severity]
[如果高重叠：Updated existing doc — matched dimensions: ...]
[如果 AGENTS.md 未引用 docs/solutions/：Added discoverability reference to AGENTS.md]
```
