# Findings & Decisions (20260314-TC-108)

## Requirements
- TC-108: 抽离可复用的 agent workflow、skills、指令模板与 bootstrap 机制到独立 agent-assets repo，支持 Codex / Claude / Gemini 多 agent 接入

## Research Findings
- 当前仓库中的 agent 资产已分散在 `.agents/`, `.claude/`, `AGENTS.md`, `.agents/docs/`, `plans/workplans/`, `scripts/plan_tracker.py` 等位置，且同时存在通用流程定义与项目特有说明。
- 当前 skills 同时包含本地 first-party 技能（如 `wt-plan`, `wt-dev`, `planning-with-files`）和通过外部来源接入的能力（如 `brainstorming`, `using-superpowers`），二者治理方式应区分。
- `wt-pm-workflow.md`、planning 三文件机制与 `plan_tracker.py` 已经形成稳定的流程资产，具备抽离价值；而当前 `AGENTS.md` 含较多项目业务背景，不适合直接搬运。
- `.agents/skills/` 与 `.claude/skills/` 中存在镜像内容，说明后续更适合抽出共享核心，再为不同 agent 渲染入口与路径适配。

## Technical Decisions
| Decision | Rationale |
|---|---|
| Distribution model | 采用 bootstrap 安装器作为默认分发方式，而非 submodule。这样项目侧只接收渲染后的本地文件，降低使用与升级复杂度。 |
| Multi-agent strategy | 采用“共享核心 + 各 agent 适配层”。流程、规则、模板共享；`AGENTS.md` / `CLAUDE.md` / `GEMINI.md` 各自渲染。 |
| Third-party skill policy | 默认记录来源、安装命令、版本和用途，不默认拷贝内容；只有修改过、关键依赖或上游不稳定时才 vendor。 |
| Migration boundary | 第一阶段只迁移可稳定复用的 first-party 资产与模板，不顺带重构当前业务仓库。 |
| Task selection | Selected tasks: TC-108, implemented in isolated worktree to avoid contaminating current business branch. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| 当前 trunk 存在用户未提交改动与未跟踪目录 | 只 stage/commit 规划相关文件，避免覆盖或混入用户工作。 |

## Resources
- plans/todo_current.md
- plans/workplans/task_plan.20260314-TC-108.md
- .agents/docs/wt-pm-workflow.md
- .claude/rules/planning-with-files.md
- .agents/skills/wt-plan/SKILL.md
- .agents/skills/wt-dev/SKILL.md
- AGENTS.md
- scripts/plan_tracker.py
