# CLAUDE.md

## 1. Project Context

- 项目目标：面向餐馆内部，完成 `daily/office` 两种场景的票据的上传、提取、人工校验、归档预览与最终 merge 入账闭环。
- 当前阶段：`M1`（MVP 本地全流程闭环）：基于任务 worktree 并行推进功能点，目标是完成上传→提取→人工校验→merge 入账的完整 Web App 流程，本地可运行。
- 当前 API Contract： `v1`（Frozen，当前唯一对接基线）。

技术栈：

- 前端：Azure Static Web Apps（计划），使用JavaScript语言编写
- 后端：FastAPI + Python（Azure Functions / Queue 模式计划）
- 文档识别：Azure Document Intelligence（office 还使用 Azure OpenAI 做语义补充）

## 2. Current Pipeline & Verified Scripts

Canonical reference pipeline（legacy-verified）：

- `tests/run_with_category.py`
- `src/bills_analysis/extract_by_azure_api.py`
- `src/bills_analysis/excel_ops.py`

Legacy/auxiliary wrappers（按需参考，不作为新功能主入口）：

- 其余 `tests/*.py` 脚本（如 JSON->Excel、merge、report、cleanup）属于历史验证与辅助脚本。

## 3. Architecture Targets

目标目录与职责：

- `src/bills_analysis/api/`：FastAPI routes（HTTP 输入输出）。
- `src/bills_analysis/services/`：业务编排（process/review/merge）。
- `src/bills_analysis/integrations/`：外部适配（azure/excel/storage/queue/repo）。
- `src/bills_analysis/models/`：schema/contract（API、任务、结果模型）。
- `src/bills_analysis/workers/`：异步任务处理（queue consumer）。
- `frontend/`：前端工程（SWA 部署）。

These boundaries are architectural contracts and must not be blurred.

里程碑（全局视角）：

- **M1: MVP 本地全流程闭环** — 完成上传→提取→人工校验→merge 入账的完整 Web App 流程，前后端联调通过，本地可运行。包含：后端迁移到分层架构、前端基于 `v1` 契约开发调用链路、API 稳定开放、前端闭环与 merge 结果页对齐。
- **M2: Docker Demo** — 将前后端封装为 Docker 容器（docker compose），用户可在本地一键启动试用。包含：容器化打包、配置外置、用户使用文档。
- **M3: Azure 上线** — 基于 Azure 基础设施（SWA + Functions/Container Apps）正式部署上线。包含：CI/CD、域名、监控、安全加固。

当前里程碑待实现功能点见 `plans/todo_current.md`；未来里程碑功能点见 `plans/todo_future.md`。

Milestone Status：

- As of `2026-02-14`：项目处于 `M1`（MVP 本地全流程闭环）阶段。
- Backend：核心流程已在 `tests/` 验证，正在下沉到 `services/integrations`，API 联调已基本跑通 daily/office 双模式。
- Frontend：已按 `v1` 契约推进上传与状态流转页面，real smoke 已通过 daily/office 双模式 merged 终态。
- 整体进度判断：`M1` 进行中，剩余功能点见 `plans/todo_current.md`。

## 4. Task-Based Worktree Workflow

每个任务使用独立 worktree 进行开发，从 main 创建分支 `feat/<task_id>-<slug>`。详见 `.claude/rules/collaboration-boundaries.md`。

核心要点：
- 文件范围语义指导：`frontend/**` 为前端范围，`src/bills_analysis/**` 为后端范围，但允许跨范围修改以完成任务闭环。
- 分支命名：`feat/<task_id>-<slug>`，Commit 前缀：`<task_id>: ...`。
- Worktree 生命周期：PM 创建任务 → 创建 worktree → Planning → Implementation → Sync main → Regression → Merge to main。
- API Contract 冻结：在实现/调试期间不得修改 `v1` 已发布字段（参见 Section 5）。

## 5. API Contract Rules (v1 Frozen)

`v1` schema 冻结，禁止 breaking change。详见 `.claude/rules/api-contract.md`。

核心要点：以 `src/bills_analysis/models/` 为唯一 contract 来源，变更必须先更新 schema 再更新调用方。

## 6. Task Tracking

当前里程碑的具体待办功能点通过 `plans/` 目录管理：

- `plans/todo_current.md`：当前里程碑下待实现的功能点（结构化表格），固定字段：`task_id/task/status/plan_id/updated_at/note`。
- 状态机：`UNPLANNED -> PLANNED -> DONE`（互斥）；`PLANNED` 与 `DONE` 必须绑定 `plan_id`。
- 任务状态与 plan 绑定优先通过命令维护：`python scripts/plan_tracker.py ...`。
- `plans/workplans/`：每个 plan 对应三文件：`task_plan.<plan_id>.md`、`findings.<plan_id>.md`、`progress.<plan_id>.md`。
- `plans/todo_future.md`：未来里程碑的功能点，仅记录参考，暂不实现。

## 7. Planning-with-files Local Customization

当用户希望Agent辅助规划plans时，使用`planning-with-files`这个SKILL。在本仓库采用 task-tracker + workplans 模式，作为多 agent 并行协作的标准入口。
状态机固定为 `UNPLANNED -> PLANNED -> DONE`，并要求 `PLANNED/DONE` 绑定 `plan_id`。
短句触发与选择策略（用户指定优先、未指定时 agent 可自主选题）详见规则文件。
操作命令和目录约定（`plans/workplans/`、`plan_tracker.py`）详见工作手册。

- 规则：`.claude/rules/planning-with-files.md`
- 操作手册：`plans/workplans/README.md`

## 7.1 Task Worktree Lifecycle Skills

Worktree 生命周期操作按执行环境拆分为两个独立 SKILL：

- **主干终端**（规划阶段）：说 `确认task`、`写plan`、`创建wt` 等触发 `wt-plan`。
  涵盖：task 定义对话 → 更新 todo → 生成 plan 三文件 → commit 到主干 → 创建 worktree + sync config。
  详细文档：`.agents/skills/wt-plan/SKILL.md`

- **wt 终端**（开发阶段）：说 `开工`、`继续开发`、`start task` 等触发 `wt-dev`。
  涵盖：自动识别 task → 恢复 plan 上下文 → 环境初始化 → sync trunk → 实现 → [PAUSE 人工测试（必经）] → regression gate → 更新计划证据 → merge 回主干（无需切换终端）→ 标记 DONE → 清理 worktree。
  详细文档：`.agents/skills/wt-dev/SKILL.md`

## 8. Commands You Should Prefer

- 启动 API：`uv run invoice-web-api`
- Contract 测试：`uv run pytest tests/test_api_schema_v1.py -q`
- 导出 OpenAPI v1：`uv run python scripts/export_openapi_v1.py`
- Frontend 开发：`pnpm dev` / `pnpm test`

## 9. Definition of Done & Safety

详见 `.claude/rules/dod-and-safety.md`。

核心要点：contract 一致性验证、功能可运行、可观测、不破坏既有流程、新代码有注释、文档按需更新。

## 10. Maintenance of This File

本文件是仓库级主协作规范。稳定规则已拆分到 `.claude/rules/*.md`：

- `.claude/rules/collaboration-boundaries.md` — 开发范围语义指导与 worktree 工作流
- `.claude/rules/api-contract.md` — v1 冻结策略与契约优先规则
- `.claude/rules/planning-with-files.md` — task-tracker/workplans 触发语义、并行约束与命令契约
- `.claude/rules/dod-and-safety.md` — 完成标准与安全约束

触发更新条件：

- API contract 变化（含版本升级）。
- 目录边界与职责变化。
- 标准启动/验证命令变化。
- DoD 或安全规范变化。

更新责任：发起变更的 session 负责同步更新本文件与 rules 文件。

冲突处理：若 rules 文件与本文件冲突，以本文件为准。
