---
title: "Handlebars 模板中非变量花括号导致 Missing helper 错误"
date: 2026-05-09
category: logic-errors
module: ".omp/prompts"
problem_type: logic_error
component: prompt-render
severity: medium
symptoms:
  - "prompt.render() 抛出 Missing helper 错误"
  - "命令执行时报 TypeError 或 Handlebars 异常"
  - "错误信息包含中文或非英文 helper 名"
root_cause: wrong_api
resolution_type: code_fix
tags:
  - handlebars
  - prompt-templates
  - missing-helper
---

# Handlebars 模板中非变量花括号导致 Missing helper 错误

## Problem

`prompt.render()` 使用 Handlebars 渲染 `.md` 模板。模板中所有 `{{ }}` 都会被解释为 Handlebars 表达式。中文文本或其他非变量内容放在 `{{ }}` 中会触发 "Missing helper" 错误，导致命令执行失败。

## Symptoms
- `prompt.render()` 抛出异常，错误信息类似 `Missing helper: "当前 ISO 时间"`
- 命令执行后返回空字符串或报错

## What Didn't Work
- **用 Handlebars 注释 `{{!-- --}}` 包裹** — 注释内容不输出，无法保留提示文本
- **注册自定义 helper 返回原始文本** — 过于复杂，每个中文短语都要注册

## Solution

移除模板中所有非变量的 `{{ }}`。中文提示文本直接写，不用花括号包裹。

**Before（触发错误）：**
```markdown
completed_at: "{{当前 ISO 时间}}"    ← Handlebars 尝试调用 helper "当前 ISO 时间"
状态: {{完成}}                        ← 同上
```

**After（正确）：**
```markdown
completed_at: "当前 ISO 时间"         ← 纯文本，Handlebars 不处理
状态: 完成
```

如果需要字面量花括号，用 `\{{ }}` 转义。

## Why This Works

Handlebars 把 `{{ }}` 内的所有内容当作表达式求值。不存在名为 "当前 ISO 时间" 的 helper，所以报错。纯文本不需要花括号标记——花括号只在注入 Handlebars 变量时使用。

## Prevention
- 模板中 `{{ }}` 只用于 Handlebars 变量（`{{topic}}`、`{{today}}`）
- 审查模板时搜索 `{{` 确认每个都是有意为之的变量
- 中文提示文本永远不用 `{{ }}` 包裹

## Related
- 源码：`packages/utils/src/prompt.ts`（`prompt.render()` 实现）
