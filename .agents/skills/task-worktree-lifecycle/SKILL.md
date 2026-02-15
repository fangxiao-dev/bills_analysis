---
name: task-worktree-lifecycle
version: "1.0.0"
description: End-to-end task worktree lifecycle for WT-PM (create/sync/init/regression/merge).
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Task Worktree Lifecycle (WT-PM)

Operational skill for the full task branch lifecycle in this repo:
1) create task worktree + sync shared config,
2) initialize backend and frontend environments,
3) sync latest mature trunk (`dev`) + run regression gate,
4) merge task branch back into `dev`.

This skill is execution-oriented. For read-only cross-branch inspection, use `cross-worktree-sync`.

## Trigger phrases

- `task-worktree-lifecycle`
- `创建task worktree并初始化`
- `task完成后回归并合并`
- `wt-pm lifecycle`

## Runtime parameters

Parse from user request. If not provided, apply defaults.

- `task_id` (required), example: `TC-200`
- `slug` (required), example: `api-merge-ui`
- `trunk` (optional, default: `dev`)
- `worktree_path` (optional, default: `../wt-<task_id>`)
- `apply_sync` (optional, default: `true`)

Derived values:

- `feature_branch=feat/<task_id>-<slug>`
- `resolved_worktree_path`:
  - if `worktree_path` provided: use as-is
  - else: `../wt-<task_id>`

Path policy:

- Default worktree path must be a sibling visible directory (for example `../wt-TC-007`).
- Do not create task worktrees under hidden folders (for example `.worktrees/`) 

## Default behavior

- Mode: semi-automatic checklist with stop points.
- Always show and run sync dry-run before sync apply.
- Never continue to Phase 4 unless all required regression checks pass.
- If dirty-tree risk is detected at a critical step, stop and request user confirmation.

## Preflight checks (must pass before Phase 1)

Run in current repo root:

```bash
git rev-parse --show-toplevel
git rev-parse --verify dev
git status --short
```

Validation rules:

- Missing `task_id` or `slug` -> stop immediately with actionable message.
- Missing `trunk` branch (`dev` by default) -> stop immediately.
- If current tree has uncommitted changes, warn user before branch/worktree mutation.

## Phase 1: Setup task worktree + sync config

Goal: create isolated task branch/worktree and sync agent/workflow config files.

Commands:

```bash
git worktree add -b feat/<task_id>-<slug> <resolved_worktree_path> <trunk>
bash scripts/sync_worktree_config.sh
bash scripts/sync_worktree_config.sh --apply
```

Notes:

- Dry-run (`bash scripts/sync_worktree_config.sh`) is mandatory and must run before apply.
- On Windows, if `bash` is unavailable or blocked, run an equivalent PowerShell sync for the same items:
  - `.agents/`
  - `.claude/rules/`
  - `.claude/skills/`
  - `.env`
  - `frontend/.env.local`
- If `apply_sync=false`, skip the apply command and report explicitly.
- If branch/worktree creation fails due permission/sandbox lock, rerun with elevated permission.
- Do not change branch naming convention as a workaround. Keep `feat/<task_id>-<slug>`.
- Output summary:
  - created branch
  - created worktree path
  - sync dry-run result
  - sync apply result (or skipped)

## Phase 2: Initialize environments (backend + frontend)

Goal: prepare runnable backend and frontend environments in the task worktree.

Commands (run from task worktree root):

```bash
uv sync --extra web
corepack enable
corepack prepare pnpm@latest --activate
pnpm --dir frontend install
```

Minimal checks:

```bash
uv run python -c "import bills_analysis"
pnpm --dir frontend test
```

Behavior:

- If any install/check command fails, stop and report exact failing command.
- Do not proceed to Phase 3 until all required Phase 2 commands pass.

## Phase 3: Sync mature trunk (`dev`) + regression gate

Goal: integrate latest trunk changes into the task branch and verify regression.

Commands (run from task worktree):

```bash
git fetch origin <trunk>
git merge origin/<trunk>
```

Fallback when remote branch is unavailable:

```bash
git merge <trunk>
```

Regression gate (required order):

```bash
uv run pytest tests/test_api_schema_v1.py -q
pnpm --dir frontend test
```

Optional smoke check:

```bash
uv run pytest tests/test_api_e2e_smoke.py -q
```

Behavior:

- If merge conflict occurs, stop and report conflict files.
- If any required regression command fails, stop and do not enter Phase 4.

## Phase 4: Merge task branch back to `dev`

Goal: merge validated task branch into mature trunk.

Commands (run in main worktree):

```bash
git checkout <trunk>
git merge --no-ff feat/<task_id>-<slug>
```

Optional cleanup (only when clean):

```bash
git -C <resolved_worktree_path> status --short
git worktree remove <resolved_worktree_path>
```

Windows cleanup fallback (when `git worktree remove` cannot delete pnpm/node_modules links):

```bash
git worktree remove --force <resolved_worktree_path>
cmd /c rmdir /S /Q <resolved_worktree_path>
git worktree prune
```

Behavior:

- If regression gate is not green, Phase 4 is forbidden.
- If merge conflict occurs, stop and provide conflict summary.
- Cleanup is optional and only allowed if task worktree is clean.

## Safety rules

- Never use destructive commands such as:
  - `git reset --hard`
  - `git checkout -- <path>`
  - force-delete branch/worktree while dirty
- Always respect dirty-tree warnings before mutation steps.
- Stop immediately on:
  - missing required parameters
  - missing trunk branch
  - failed install/test/merge commands

## Compatibility note

- Use `cross-worktree-sync` only for read-only cross-branch inspection.
- Use `task-worktree-lifecycle` for operational lifecycle (create/init/sync/regression/merge).

## Acceptance checklist

1. Create flow:
- Input: `task_id=TC-200`, `slug=api-merge-ui`
- Expect: `feat/TC-200-api-merge-ui` and `../wt-TC-200` created; sync dry-run/apply executed.

2. Init flow:
- Expect backend sync and frontend install complete successfully in task worktree.

3. Sync + regression flow:
- Expect trunk merge attempted first, then required regression commands run in order.

4. Merge flow:
- Expect `dev` receives `--no-ff` merge only when regression is green.

5. Failure handling:
- Missing params / missing trunk / regression failure / merge conflicts
- Expect immediate stop with explicit actionable error summary.
