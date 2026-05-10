> 工作流: /explore → /task next → /task done → /compound（可从任意步骤开始，不需按顺序）
{{projectContext}}


## /task done — 完成任务：{{taskName}}

请执行以下完整流程：

### 步骤 1a：Spec Compliance 自检

在运行 verify 命令之前，对照任务的 goal 和 steps 检查实现：

- 是否所有 steps 都已执行？（列出每个 step 的完成状态）
- 是否有超出任务范围的额外改动？（对照 key_files 检查 git diff）
- verify 命令是否覆盖了 goal 的核心目标？

**如果发现遗漏**：补全后再进入步骤 1b。
**如果发现多余改动**：记录到 deviations，但不要立即回滚——先完成验证再处理。

### 步骤 1b：执行验证

读取任务文件中的 `verify:` 字段，逐条执行验证。

- 每条 verify 条件必须是一条可在终端运行的命令
- 逐条执行，记录每条的实际结果（exit code + 关键输出）
- 不要跳过任何验证条目

**验证结果判定：**

| 所有验证通过 | 部分通过 | 全部失败 |
|-------------|---------|---------|
| result: pass | result: partial | result: fail |

- **partial**：部分 verify 命令失败，但核心目标已达成
- **fail**：核心 verify 失败，任务未完成

### 步骤 1c：Code Quality 自检

验证通过后，检查代码质量（仅在 verify 全部或大部分通过时执行）：

- 是否有 magic number 或硬编码值需要提取为常量？
- 新增代码是否遵循项目既有模式（对照 _context.md 中的 Code Conventions）？
- 是否有重复代码需要提取？
- 是否有未处理的边界情况或错误路径？

**如果发现问题**：修复后重新验证（回到步骤 1b）。
**如果无问题**：继续步骤 2。

```yaml
{{taskContent}}
```

### 步骤 2：处理验证结果

**全部通过 → 继续 步骤 3**

**部分通过 → 更新任务状态为 partial：**
- 将任务文件中 `status` 改为 `status: partial`
- 在 achive 中记录哪些验证失败及原因
- 继续步骤 3，但 achive 中 result 为 `partial`

**核心验证失败 → 更新任务状态为 blocked：**
- 将任务文件中 `status` 改为 `status: blocked`
- 在任务文件中添加 `blocker:` 字段描述阻塞原因
- **不生成 achive**（achive 只在任务有实质性进展时生成）
- 输出阻塞信息并停止

### 步骤 3：标记完成

将 `docs/workflow/tasks/{{taskFile}}` 中的 `status` 改为适当状态（done / partial）。

### 范围纪律

**不要**"顺手整理"改动范围外的代码、重构你未修改的文件的 import、或因为"看起来有用"而添加任务未要求的功能。如果发现值得改进的地方，记下来但不要修。单独的关注点，单独的任务。

### 何时不用 /task done

- 任务没有 verify 字段（直接手动标记完成即可）
- 任务是被放弃的，不是完成的（不应走完成流程）

### 常见自我辩解

| 辩解 | 现实 |
|------|------|
| 测试基本都过了，差不多就行 | 验证不过就不是 done。更新状态为 blocked。 |
| Spec 自检多此一举 | 5 分钟自检防止任务偏离。发现遗漏比修复遗漏便宜 10 倍。 |
| Code Quality 自检可以跳过 | verify 通过只说明功能正确，不代表代码合格。 |
| compound 稍后再补 | compound 花两分钟，下次省三十分钟。趁上下文还在，现在做。 |
| 手动测过了，可以跳过验证 | 手动测试不是验证。写一条命令或测试证明它能工作。 |
| 顺手重构一下旁边的代码 | 范围纪律。记下来，不要修。单独关注点，单独任务。 |

### 红旗信号

- 未运行验证命令就标记任务完成
- 验证条件失败却将状态改为 done
- 跳过 Spec Compliance 自检直接跑验证
- 跳过 Code Quality 自检（验证通过 ≠ 代码合格）
- 提交中包含与任务无关的改动
- 因为"只是额外开销"而跳过 achive

### 步骤 4：Commit

```bash
git add docs/workflow/tasks/{{taskFile}}
git commit -m "type: 简短描述 -{{taskId}}"
```

- `type` 使用 conventional commit（feat/fix/refactor/docs/chore/test 等），根据任务实际内容选择
- `-{{taskId}}` 作为尾部附加信息，关联任务文件
- 例如：`feat: add user authentication -task-01`、`fix: resolve extension hang -task-03`

如果工作目录有其他未提交的改动（本次任务的代码变更），也一并 commit。

### 步骤 5：生成 Achive 总结

保存到 `docs/workflow/achives/{{taskFile}}`：

```yaml
id: {{taskId}}
title: {{taskTitle}}
completed_at: "当前 ISO 时间"
commit: "git commit hash"
result: pass  # pass | partial | fail
what_was_done: 一句话总结做了什么
deviations: []  # 与任务计划的偏差
files_changed: []  # 修改的文件及变更摘要
verification: []  # 每条验证的实际结果
```

各字段详细格式：

```yaml
deviations:
  - plan: "原计划使用 X 方案"
    actual: "实际使用了 Y 方案"
    reason: "X 方案在 Z 条件下不可行，因为..."

files_changed:
  - path: src/auth/handler.ts
    change: "新增 JWT 验证中间件"
  - path: src/auth/types.ts
    change: "新增 TokenPayload 接口"

verification:
  - check: "bun test src/auth.test.ts"
    result: pass
    detail: "12/12 tests passed"
  - check: "bun run check:ts"
    result: pass
    detail: "no type errors"
```

然后 commit achive 文件：

```bash
git add docs/workflow/achives/{{taskFile}}
git commit -m "docs: achive {{taskId}}"
```

### 步骤 6：经验沉淀（条件触发）

**判断标准**（满足任一则触发 `/compound --auto`）：

- 问题排查超过 5 分钟
- 尝试过失败方案（值得记录 "What Didn't Work"）
- 问题可能再次发生（同类场景、常见陷阱）
- 涉及架构决策或技术选型
- 发现了团队规范或最佳实践
- 实现方案与原计划有重大偏差（deviations 非空）

如果没有遇到以上情况，跳过此步。

### 步骤 7：输出总结

所有步骤完成后，输出总结：

```
✅ 任务完成：{{taskName}}
📝 Achive: docs/workflow/achives/{{taskFile}}
🔗 Commit: {hash}
📊 Result: {pass|partial}
[如果 result 为 partial：⚠️ 部分验证未通过，详见 achive]
[如果触发了 compound：📚 Compound: docs/solutions/{category}/{filename}.md]
```

### 失败处理

如果步骤 1b 中核心验证失败：

1. **不要强行标记 done** — 这是最重要的规则
2. 更新任务文件：`status: blocked`，添加 `blocker: 具体原因`
3. 尝试修复：如果阻塞原因可在当前 session 解决，修复后重新验证
4. 修复成功 → 继续 步骤 3
5. 修复失败 → 输出阻塞信息，让用户决定下一步

**绝对不要：**
- 跳过失败的验证继续标记 done
- 把 fail 标记为 partial
- 把 partial 标记为 pass
- 忽略验证结果直接提交
