---
title: "OpenSpec 对 workflow 设计的七个启发"
date: 2026-05-09
category: architecture-patterns
module: .omp/commands
problem_type: architecture_pattern
component: workflow
severity: high
applies_when:
  - "设计或迭代 oh-my-pi 的 workflow 命令系统"
  - "评估是否引入 Schema-driven workflow 或 Change-based 架构"
  - "优化 /explore /task /compound 命令的信息流和用户体验"
tags:
  - openspec
  - workflow-design
  - schema-driven
  - delta-specs
  - dag
---

# OpenSpec 对 workflow 设计的七个启发

## Context

对比 OpenSpec（`C:/Users/admin/Desktop/ai-agent-source/plugins/OpenSpec/OpenSpec-main`）和我们的 workflow 命令系统（`/explore`→`/task next`→`/task done`→`/compound`），发现七个架构差异，其中三个值得直接引入。

## Guidance

### 1. Context + Rules 注入（高价值、低成本 — 直接引入）

OpenSpec 的 `openspec/config.yaml` 通过 `<context>` 和 `<rules>` 标签向每个 artifact 的 prompt 注入项目级上下文：

```yaml
# openspec/config.yaml
context: |
  Tech stack: TypeScript, Bun, Node.js
  Testing: bun test, vitest
rules:
  specs:
    - Use Given/When/Then format
  tasks:
    - Include cross-platform testing
```

我们的 workflow 命令没有全局项目上下文——每个 prompt 独立，LLM 不了解项目约束。

**实现方式：** 在 `.omp/prompts/workflow/` 下加一个 `_context.md` 文件（或 `config.yaml`），workflow 命令在 `prompt.render()` 时自动注入。用户可以填写项目的技术栈、规范、约定，所有 workflow prompt 都能读到。

### 2. Delta-based compound 文档（高价值、低成本 — 直接引入）

OpenSpec 的 delta spec 用 `ADDED/MODIFIED/REMOVED` 三段式描述变更，而不是全量重写：

```markdown
## ADDED Requirements
### Requirement: Two-Factor Authentication
...

## MODIFIED Requirements
### Requirement: Session Expiration
The system MUST expire sessions after 15 minutes (Previously: 30 minutes)

## REMOVED Requirements
### Requirement: Remember Me
(Deprecated in favor of 2FA)
```

我们的 compound 文档是全量的——每次写一个新文档，跟已有文档的关系只有"Related"引用。应该加入 `Updates` / `Supersedes` / `Extends` 字段到 YAML frontmatter，明确新文档与已有文档的增量关系。

### 3. 依赖是使能者不是关卡（高价值、中成本 — 需设计）

OpenSpec 核心设计原则："Dependencies are enablers, not gates"——依赖告诉你什么成为可能，不强制你必须按顺序走。

我们的流程是严格线性的：`/explore` → `/task next` → `/task done` → `/compound`。但实际工作中：
- 有时不需要探索，直接从 task 开始
- 有时从 compound 倒推（发现已有文档需要更新）
- 有时 explore 和 task 交叉进行

**改进方向：** 把线性流程改为 DAG。每个命令声明自己的 `requires`（前置条件）和 `enables`（解锁的下一步），但不强制顺序。`/workflow` 命令显示当前可用的动作和它们的依赖状态。

### 4. Change 作为一等公民（高价值、中成本 — 需设计）

OpenSpec 的 `changes/` 目录把所有 artifact 放在一起：

```
openspec/changes/add-dark-mode/
├── proposal.md
├── design.md
├── tasks.md
└── specs/
```

我们的 `docs/workflow/` 是平铺结构——scene-alignment.md、key-technologies.md、tasks/ 目录，没有"变更"边界。一个功能的探索、任务、compound 可能分散在多个目录。

**改进方向：** 引入 change 概念，每个变更自包含在一个目录下（如 `docs/workflow/changes/add-workflow-commands/`），包含场景对齐、技术选型、任务列表。完成时归档。

### 5. Apply phase 的 checkbox 追踪（中价值、低成本）

OpenSpec 的 `/opsx:apply` 解析 tasks.md 中的 `- [ ]` / `- [x]` checkbox 追踪进度。我们的 task 是独立 YAML 文件，状态通过 `status: pending/done` 字段管理。

YAML 文件的好处是结构化（有 depends_on、verify、key_files），缺点是不可读——人不会直接打开 YAML 文件看进度。

**改进方向：** 在 task done 时自动生成一个 `tasks.md` 汇总文件，用 checkbox 格式，可被 LLM 和人类同时读取。

### 6. 归档与 specs 合并（中价值、中成本）

OpenSpec 的 archive 流程：delta specs 合并到主 specs，change 移到 archive/。我们的 compound 写入 `docs/solutions/` 后没有后续——没有归档，没有与已有文档的合并。

高重叠的 compound 会"更新现有文档"，但这是 prompt 层面的规则，没有工具支持。如果引入 delta-based 文档（启发 2），归档时可以自动合并。

### 7. Schema-driven workflow 定义（高价值、高成本 — 长期方向）

OpenSpec 用 `schema.yaml` 定义 artifact 类型和依赖关系（DAG），支持自定义 workflow。我们的 workflow 是硬编码在四个 TypeScript 命令 + 七个 prompt 模板里的。

自定义 schema 的好处：
- 团队可以 fork 默认 workflow，加自己的 artifact（如 review、retrospective）
- 不改代码就能调整流程
- 社区可以共享 workflow schema

但实现成本高——需要 DAG 引擎、状态检测、模板加载器。目前不急。

## Why This Matters

当前 workflow 的最大问题是**刚性**：线性流程、无项目上下文、无增量关系。这三个问题直接导致：
- 用户在不适合的场景强制走完整流程
- LLM 不了解项目约束，生成的任务和文档缺乏针对性
- compound 文档之间只有松散引用，知识库是扁平的而非结构化的

## When to Apply

- 迭代 workflow 命令时，优先实现启发 1（Context 注入）和启发 2（Delta compound）
- 设计 Change-based 架构时，参考 OpenSpec 的 `changes/` 目录结构
- 长期规划中考虑 Schema-driven workflow（启发 7），但不急于实现

## Examples

**当前（刚性线性流程）：**
```
/explore → /task next → /task done → /compound
   ↑ 必须从 explore 开始，即使需求已经明确
```

**改进后（DAG 使能者模型）：**
```
/explore ─── enables ─── /task next ─── enables ─── /task done ─── enables ─── /compound
   │                         ↑                                            ↑
   │                    也可以直接开始                               也可以从已有文档倒推
   │                    （需求已明确）                             （发现需要更新）
```

**当前（无项目上下文）：**
```typescript
// explore.md — 对项目一无所知
return prompt.render(explorePrompt, { topic, existingContext });
```

**改进后（注入项目上下文）：**
```typescript
// 自动注入 _context.md
const context = await loadProjectContext(); // 从 .omp/prompts/workflow/_context.md 读取
return prompt.render(explorePrompt, { topic, existingContext, projectContext: context });
```

## Related

- OpenSpec 源码：`C:/Users/admin/Desktop/ai-agent-source/plugins/OpenSpec/OpenSpec-main/`
- OpenSpec 核心概念：`docs/concepts.md`（Specs、Changes、Delta Specs、Schemas）
- OpenSpec 工作流：`docs/workflows.md`（Quick Feature、Exploratory、Parallel Changes）
- OpenSpec Schema 定义：`schemas/spec-driven/schema.yaml`（artifact DAG + instruction 模板）
- OpenSpec 架构：`docs/opsx.md`（OPSX 工作流、DAG 引擎、信息流）
- 我们的 compound prompt：`.omp/prompts/workflow/compound.md`
