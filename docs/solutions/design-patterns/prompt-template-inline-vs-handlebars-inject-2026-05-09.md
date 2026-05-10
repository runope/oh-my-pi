---
title: "Prompt 模板内容应内联在 .md 文件中而非通过 Handlebars 变量注入"
date: 2026-05-09
category: design-patterns
module: ".omp/prompts"
problem_type: design_pattern
component: prompt-templates
severity: medium
applies_when:
  - "Custom Command 的 prompt 包含分类列表、模板、枚举等静态结构化内容"
  - "TypeScript 代码中存在大段模板字符串用于注入到 .md 文件"
tags:
  - prompt-templates
  - handlebars
  - inline-vs-inject
---

# Prompt 模板内容应内联在 .md 文件中而非通过 Handlebars 变量注入

## Context

在 `/compound` 命令的实现中，最初将 Bug/Knowledge track 模板、problem_type 列表、分类映射放在 TypeScript 中，通过 Handlebars 变量（`{{bugTemplate}}`、`{{knowledgeTemplate}}`、`{{problemTypeList}}`）注入到 .md 模板。这导致 TypeScript 代码 ~310 行，其中大部分是模板字符串。

## Guidance

**模板、分类列表、枚举值等静态内容直接写在 .md 文件中。** TypeScript 只负责注入真正的动态数据（用户输入、运行时计算值、文件列表）。

```typescript
// 正确：只注入动态数据
return prompt.render(compoundPrompt, {
    trackSelection: "已选择 Bug 🐛 track",
    today: new Date().toISOString().slice(0, 10),
    overlappingDocsSection: "",
});

// 错误：通过 Handlebars 变量注入静态模板内容
const BUG_TEMPLATE = `### Bug Track 文档模板\n...\n`;
const KNOWLEDGE_TEMPLATE = `### Knowledge Track 文档模板\n...\n`;
return prompt.render(compoundPrompt, {
    bugTemplate: BUG_TEMPLATE,
    knowledgeTemplate: KNOWLEDGE_TEMPLATE,
    problemTypeList: buildProblemTypeList(),
});
```

## Why This Matters

| 维度 | 注入方式 | 内联方式 |
|------|---------|---------|
| TypeScript 行数 | ~310 行 | ~170 行 |
| 修改模板 | 改 .ts → 重新加载命令 | 改 .md → 即时生效 |
| 变量数量 | 6+ 个 | 2-3 个（仅动态数据） |
| 可读性 | 模板内容分散在两个文件 | .md 文件自包含 |
| 调试 | 需要追踪变量注入链 | 直接读 .md 文件 |

## When to Apply
- .md 模板中有条件显示的大段结构化内容
- TypeScript 中出现 50+ 行的模板字符串常量
- Handlebars 变量的值是固定的字符串而非运行时计算

## Examples

**Before（TypeScript 注入静态内容）：**
```typescript
// commands.ts
const BUG_TEMPLATE = `
### Bug Track 文档模板
\`\`\`markdown
---
title: "问题简述"
...
\`\`\`
`;
const CATEGORY_MAP = { build_error: "build-errors", ... };
const ALL_PROBLEM_TYPES = [...];

return prompt.render(compound, { bugTemplate: BUG_TEMPLATE, problemTypeList: ... });
```

**After（内联在 .md 中）：**
```markdown
<!-- compound.md -->
#### Bug Track 文档模板

\`\`\`markdown
---
title: "问题简述"
...
\`\`\`

### Bug Track problem_type 选项
- \`build_error\` → \`docs/solutions/build-errors/\`
- \`test_failure\` → \`docs/solutions/test-failures/\`
...
```

```typescript
// commands.ts — 只注入动态数据
return prompt.render(compound, { trackSelection, today, topicSection });
```

## Related
- 参考：compound-engineering-plugin 的 `ce-compound/SKILL.md`（32KB 自包含 skill 文件）
