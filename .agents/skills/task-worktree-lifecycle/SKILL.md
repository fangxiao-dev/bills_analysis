---
name: task-worktree-lifecycle
description: Full task lifecycle from plan commit to post-merge verification (WT-PM). Covers plan artifact commit on trunk, worktree creation and environment init, development, regression gate, merge, and manual smoke test.
user-invokable: true
---

# Task Worktree Lifecycle (WT-PM)

Operational skill for the full task lifecycle in this repo, from planning artifact commit through post-merge verification:

0) commit plan artifacts to trunk (pre-worktree),
1) create task worktree + sync shared config,
2) initialize backend and frontend environments,
3) sync latest mature trunk (`dev`) + run regression gate,
4) update planning artifacts (`plans/workplans/*` + `plans/todo_current.md`),
5) merge task branch back into `dev`,
6) post-merge manual smoke test.

This skill is execution-oriented. For read-only cross-branch inspection, use `cross-worktree-sync`.

## Trigger phrases

- `task-worktree-lifecycle`
- `创建task worktree并初始化`
- `task完成后回归并合并`
- `wt-pm lifecycle`
- `规划完成后继续开发流程`
- `从plan落盘开始到合并`

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
- Never continue to Phase 5 unless plan/progress/todo updates are complete.
- If dirty-tree risk is detected at a critical step, stop and request user confirmation.
- If task worktree already exists, skip `git worktree add` but still execute Phase 1 sync from trunk (`dev`) as source.

## Phase 0: Commit planning artifacts to trunk (required before worktree creation)

Goal: persist task plan files and status to trunk so the worktree starts with a
complete planning snapshot and the commit has its own audit node.

Pre-conditions (must all be true before running this phase):

- Agent is currently on trunk (`dev` by default).
- Task entry exists in `plans/todo_current.md` with `status=PLANNED` and a bound `plan_id`.
- Three plan files exist under `plans/workplans/`:
  - `task_plan.<plan_id>.md`
  - `findings.<plan_id>.md`
  - `progress.<plan_id>.md`

Commands:

```bash
git add plans/todo_current.md \
        plans/workplans/task_plan.<plan_id>.md \
        plans/workplans/findings.<plan_id>.md \
        plans/workplans/progress.<plan_id>.md
git commit -m "<task_id>: add planning docs for <slug>"
```

Behavior:

- If any of the four files is missing or unstaged, stop and list the missing files.
- Only stage those four paths; do not include unrelated changes.
- After a successful commit, proceed to Preflight checks and Phase 1.
- If the user confirms plan files were already committed in a prior session, skip this phase.

---

## Preflight checks (must pass before Phase 1)

Run in current repo root:

```bash
git rev-parse --show-toplevel
git rev-parse --verify <trunk>
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

Existing-worktree resume path (mandatory when target worktree already exists):

```bash
# run from trunk worktree root (<trunk> branch, usually dev), not from task worktree
bash scripts/sync_worktree_config.sh
bash scripts/sync_worktree_config.sh --apply
```

Windows fallback (when `bash` is unavailable or blocked):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sync_worktree_config.ps1
powershell -ExecutionPolicy Bypass -File scripts/sync_worktree_config.ps1 -Apply
```

Notes:

- Dry-run (`bash scripts/sync_worktree_config.sh`) is mandatory and must run before apply.
- Sync gate is mandatory: if `apply_sync=true`, Phase 1 is successful only after both dry-run and apply succeed.
- `sync_worktree_config` is directional (`current worktree -> other worktrees`), so when expecting `.env` / `frontend/.env.local` from trunk, run sync in trunk as source.
- `bash` availability must be checked before sync commands:
  - if available: run `.sh` dry-run + apply.
  - if unavailable/blocked: must switch to `scripts/sync_worktree_config.ps1` dry-run + apply.
- If both `.sh` and `.ps1` sync paths fail, stop immediately and do not continue to Phase 2.
- If `apply_sync=false`, skip the apply command and report explicitly.
- If branch/worktree creation fails due permission/sandbox lock, rerun with elevated permission.
- Do not change branch naming convention as a workaround. Keep `feat/<task_id>-<slug>`.
- Phase 2 is forbidden until sync gate and post-check pass.
- Post-check is mandatory (must be included in output evidence):
  - verify `.agents/`, `.claude/rules/`, `.claude/skills/`, `.env`, `frontend/.env.local` in target worktree.
  - for files, verify content hash equality; for directories, verify they exist and report file counts.
- Output summary:
  - created branch
  - created worktree path
  - sync method (`bash` or `powershell`)
  - sync dry-run result
  - sync apply result (or skipped)
  - post-check result

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

## Phase 4: Update Plan Files Before Trunk Merge (mandatory)

Goal: persist task completion evidence before merging feature branch into trunk.

Required updates (run from task worktree):

```bash
# Update task progress and findings files for bound plan_id
# e.g. plans/workplans/progress.<plan_id>.md / findings.<plan_id>.md

# Mark task as DONE with plan_id in todo tracker
python scripts/plan_tracker.py set-status --task-id <task_id> --status DONE --plan-id <plan_id>
```

Behavior:

- Phase 4 is mandatory after regression gate and before trunk merge.
- Required evidence:
  - `plans/workplans/progress.<plan_id>.md` updated with final execution/testing notes.
  - `plans/workplans/findings.<plan_id>.md` updated with final decisions/risks (if any).
  - `plans/todo_current.md` updated to `DONE` with matching `plan_id` and timestamp.
- If any required planning file update is missing, Phase 5 is forbidden.

## Phase 5: Merge task branch back to `dev`

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

- If regression gate is not green, Phase 5 is forbidden.
- If planning updates from Phase 4 are incomplete, Phase 5 is forbidden.
- If merge conflict occurs, stop and provide conflict summary.
- Cleanup is optional and only allowed if task worktree is clean.

## Conflict triage protocol (mandatory)

When `git merge` reports conflicts, do not auto-resolve by fixed branch priority.

Required first step:

```bash
git status --short
git diff --name-only --diff-filter=U
git diff --merge
```

Decision rules (apply file by file):

- Task-scoped progress files (for current task plan/progress/findings, or task-specific feature code touched mainly in this branch): prefer feature branch side.
- Shared baseline/integration files (global CI, shared config, dependency lock updates not tied to current task): prefer trunk side.
- Contracts/schemas/public API files: do not auto-pick; require explicit manual review and rationale.

Forbidden behavior:

- Do not use blanket merge strategies like `-X ours` or `-X theirs`.
- Do not apply one-shot branch-wide preference without conflict analysis.

Output requirement:

- List conflicted files and per-file decision (`feature` / `trunk` / `manual`).
- Provide one-line rationale per file before resolving.

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

## Phase 6: Post-merge manual verification (recommended)

Goal: confirm the feature works end-to-end in the integrated trunk codebase after
the automated regression gate has passed.

Steps:

1. Start the application on trunk: `uv run invoice-web-api` (or `docker compose up` for M2+).
2. Walk through the core user flow relevant to this task (e.g., upload → extract → review → merge).
3. Spot-check adjacent features for regressions not caught by automated tests.
4. Record the outcome in `plans/workplans/progress.<plan_id>.md` (✅ passed / ❌ blocked with details).

Behavior:

- This phase is **recommended, not gated**: it does not block worktree cleanup or task `DONE` status.
- If a regression is found: reopen the task branch, fix, re-run Phases 3–5, then retest.
- Worktree cleanup (`git worktree remove`) may proceed independently of this phase if the
  tester is already confident from the automated regression gate.

---

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
