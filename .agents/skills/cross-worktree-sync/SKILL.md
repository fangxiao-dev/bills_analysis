---
name: cross-worktree-sync
description: Read committed files and recent history from other task branches. Use when checking parallel task status, reviewing completed tasks, or syncing implementation patterns. Trigger phrases include "查看其他任务状态", "sync with task branch", "check other branch".
---

# Cross-Worktree Sync (Task-Based)

通用工具型流程：从当前 worktree 读取其他任务分支已 commit 的文件内容。本 SKILL 只负责"发现分支 + 读取文件"，不做语义分析。

## 1) Determine current task

从当前分支名推断当前任务：

```bash
git rev-parse --abbrev-ref HEAD
```

- `feat/<task_id>-*` → current task = `<task_id>`
- `main` → not in task worktree
- 如果无法推断，要求用户指定目标分支

## 2) Discover other task branches

列出其他任务分支：

```bash
# 列出所有本地任务分支
git branch --list 'feat/*'

# 查看最近活跃的分支
git for-each-ref --sort=-committerdate refs/heads/feat/ --format='%(refname:short) %(committerdate:relative)'
```

确认目标分支后，记录：
- 目标分支名（如 `feat/TC-006-log-improve`）
- 目标 HEAD commit（`git rev-parse --short <branch>`）

## 3) Read committed files

根据调用方需要，使用以下命令读取已 commit 的内容：

**读取单个文件：**
```bash
git show <branch>:<filepath>
```

常见目标文件：
- `plans/workplans/progress.<plan_id>.md` — 任务执行进度
- `plans/workplans/findings.<plan_id>.md` — 技术决策与风险
- `CLAUDE.md` / `AGENTS.md` — 检查规范差异
- 任意代码文件 — 按需指定

**查看最近 commit 摘要：**
```bash
git log --oneline -N <branch>
```

**对比文件差异：**
```bash
git diff <my-branch>...<other-branch> -- <filepath>
```

## 4) Output results

输出以下信息，供调用方或用户进一步分析：

```
目标分支: <branch-name>
目标 HEAD: <short-hash> (<commit-date>)

--- 请求的文件内容 ---
<file content>
```

**本 SKILL 不负责**：
- 语义分析（任务是否完成、是否有阻塞）
- 决策建议（是否需要 sync、是否有冲突）
- 文件修改（只读操作）

这些职责由调用方（其他 SKILL、Agent、用户）自行完成。
