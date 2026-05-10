# Git 工作流 - Fork 与二次开发

本文档记录从 upstream 仓库 fork 并进行二次开发的 Git 工作流程。

## 1. 初始配置

### 1.1 配置 Remote

如果你已经克隆了 upstream 仓库，可以直接修改 remote 配置：

```bash
# 把当前的 origin 重命名为 upstream
git remote rename origin upstream

# 添加你的 fork 作为新的 origin
git remote add origin https://github.com/YOUR_USERNAME/oh-my-pi.git

# 验证配置
git remote -v
# origin    https://github.com/YOUR_USERNAME/oh-my-pi.git (fetch)
# origin    https://github.com/YOUR_USERNAME/oh-my-pi.git (push)
# upstream  https://github.com/can1357/oh-my-pi.git (fetch)
# upstream  https://github.com/can1357/oh-my-pi.git (push)
```

### 1.2 创建开发分支

```bash
# 基于 main 创建开发分支
git checkout -b dev

# 推送到远程并设置追踪关系
git push -u origin dev
```

**追踪关系的作用：**
- 设置追踪后，`git pull` / `git push` 自动使用对应的远程分支
- 无需每次指定 `origin dev`

---

## 2. 分支策略

```
main         <- 保持与 upstream/main 同步，用于 rebase
  └── dev    <- 开发主线，日常开发在这里
       └── feature/xxx  <- 具体功能分支
```

| 分支 | 用途 | 操作 |
|------|------|------|
| `main` | 同步 upstream，不做开发 | 只 rebase upstream/main |
| `dev` | 开发主线 | 二次开发的主要分支 |
| `feature/*` | 功能分支 | 从 dev 拉出，完成后合并回 dev |

**为什么需要 dev 分支？**

保持 main 纯净，可以无冲突地同步 upstream：

```
# main 只同步 upstream，快进无冲突
main          ─── C ─── D ─── E
                           \
dev                        └── X ─── Y ─── Z
```

---

## 3. 同步 Upstream

### 3.1 同步 main 分支

```bash
# 1. 下载 upstream 最新提交
git fetch upstream

# 2. 切换到 main
git checkout main

# 3. rebase 到 upstream/main
git rebase upstream/main

# 4. 推送到你的 fork
git push origin main
```

如果之前已经 push 过 main 且 rebase 改变了历史：
```bash
git push origin main --force-with-lease
```

### 3.2 同步 dev 分支

```bash
# 1. 切换到 dev
git checkout dev

# 2. rebase 到最新的 main
git rebase main

# 3. 推送到你的 fork
git push origin dev --force-with-lease
```

**rebase 后的提交变化：**

```
# rebase 前
main          ─── C ─── D ─── E
               \
dev            └── X ─── Y ─── Z

# rebase 后
main          ─── C ─── D ─── E
                           \
dev                        └── X' ─── Y' ─── Z'
```

---

## 4. 日常工作流

### 4.1 开发新功能

```bash
# 基于 dev 创建功能分支
git checkout dev
git checkout -b feature/my-feature

# 开发、提交...
git add .
git commit -m "feat: add my feature"

# 合并回 dev
git checkout dev
git merge --no-ff feature/my-feature

# 推送
git push origin dev
```

### 4.2 保持 dev 最新

定期同步 upstream：

```bash
# 同步 main
git fetch upstream
git checkout main
git rebase upstream/main
git push origin main

# 同步 dev
git checkout dev
git rebase main
git push origin dev --force-with-lease
```

---

## 5. Rebase 冲突处理

### 5.1 遇到冲突

```bash
git checkout dev
git rebase main

# 如果有冲突：
# CONFLICT (content): Merge conflict in src/file.ts
```

### 5.2 解决步骤

```bash
# 1. 手动编辑冲突文件，解决标记
# <<<<<<< HEAD
# ...
# =======
# ...
# >>>>>>> commit-hash

# 2. 标记为已解决
git add src/file.ts

# 3. 继续 rebase
git rebase --continue

# 4. 如果想放弃
git rebase --abort
```

---

## 6. 安全措施

### 6.1 Rebase 前备份

```bash
# 创建备份分支
git branch backup/dev

# 执行 rebase
git rebase main

# 如果翻车，恢复
git reset --hard backup/dev

# 成功后删除备份
git branch -d backup/dev
```

### 6.2 使用 --force-with-lease

```bash
# ❌ 危险：可能覆盖别人的提交
git push --force

# ✓ 安全：检查远程是否有新提交
git push --force-with-lease
```

`--force-with-lease` 会在远程分支有新提交时拒绝推送，避免覆盖他人的工作。

---

## 7. 快速参考

### 常用命令

| 操作 | 命令 |
|------|------|
| 同步 upstream | `git fetch upstream` |
| 更新 main | `git checkout main && git rebase upstream/main` |
| 更新 dev | `git checkout dev && git rebase main` |
| 创建功能分支 | `git checkout -b feature/xxx` |
| 安全强制推送 | `git push --force-with-lease` |
| 查看 remote | `git remote -v` |
| 查看分支追踪 | `git branch -vv` |

### 同步脚本

创建 `scripts/sync-upstream.sh`：

```bash
#!/bin/bash
# 同步 upstream 到本地 main 和 dev 分支

set -e

echo "Fetching upstream..."
git fetch upstream

echo "Syncing main branch..."
git checkout main
git rebase upstream/main
git push origin main

echo "✓ main synced with upstream"

if git show-ref --verify --quiet refs/heads/dev; then
    echo "Rebasing dev onto upstream/main..."
    git checkout dev
    git rebase upstream/main
    git push origin dev --force-with-lease
    echo "✓ dev rebased onto upstream/main"
fi

echo "Done!"
```

---

## 8. 版本管理

### 8.1 版本号策略

在 `package.json` 中添加后缀，区分你的版本：

```json
{
  "version": "14.5.3-fork.1"
}
```

### 8.2 CHANGELOG

在 CHANGELOG.md 中记录你的变更：

```markdown
## [Unreleased]

### Added
- Your new feature

### Changed
- Your modifications

## [14.5.3-fork.1] - 2026-05-05

### Added
- Initial fork changes
```

---

## 9. 常见问题

### Q: rebase 后本地和远程历史不一致？

```bash
# 本地有新的提交历史
git push origin dev --force-with-lease
```

### Q: 想回退到 rebase 前的状态？

```bash
# 查看 reflog
git reflog

# 回退到指定状态
git reset --hard HEAD@{n}
```

### Q: 如何查看当前分支追踪的远程分支？

```bash
git branch -vv
# * dev    abc1234 [origin/dev] Your commit message
#   main   def5678 [upstream/main] Upstream commit
```

### Q: 如何取消分支追踪？

```bash
git branch --unset-upstream dev
```
