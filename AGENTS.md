# AGENTS.md

## 1) Project 介绍
本项目是一个面向餐馆内部使用的账单归档与分析 Web App。核心场景：
- daily：店长每天上传当日结算小票和零星支出 PDF，系统提取 Brutto/Netto/store_name 等并人工校验后入库（当前载体为 Excel）。
- office：每月上传银行支出/发票 PDF，系统提取 brutto/netto/sender/tax_id/receiver等 校验信息，人工确认后追加到月度数据中。
- 上传 PDF 会做压缩归档，并生成可预览链接，便于人工核查。

当前技术方向：
- 前端：Azure Static Web Apps（计划），使用JavaScript语言编写
- 后端：FastAPI + Python（Azure Functions / Queue 模式计划）
- 文档识别：Azure Document Intelligence（office 还使用 Azure OpenAI 做语义补充）

## 2) 当前进展（已验证脚本）
以下脚本已用于本地流程验证（主要在 tests/ 与 src/）：

### Pipeline / 提取
- `tests/run_with_category.py`
  - 总入口；按类别组织输入（daily: bar/zbon；office）。
- `tests/vlm_pipeline_api.py`
  - 主处理流程：调用 Azure DI 提取、归档压缩 PDF、产出结果 JSON。
- `src/bills_analysis/extract_by_azure_api.py`
  - Azure DI + Office 场景补充语义提取逻辑。
- `src/bills_analysis/preprocess.py`
  - 图像预处理与 PDF 压缩相关逻辑。
- `src/bills_analysis/render.py`
  - PDF 渲染相关。

### JSON -> 待校验 Excel
- `tests/json_to_excel_map.py`（daily）
- `tests/json_to_excel_office.py`（office）
- `src/bills_analysis/excel_ops.py`
  - 日期规范化、阈值判断、映射和通用 Excel 操作函数。

### 校验后合并
- `tests/merge_excel_entry.py`（合并入口）
- `tests/merge_daily_excel.py`
- `tests/merge_office_excel.py`

### 其他
- `tests/config.json`：静态阈值/参数配置（data-driven）
- `tests/cleanup_outputs.py`：中间产物清理
- `tests/vlm_pipeline_report.py`：报告实验脚本（后续可产品化）
- 注意：`playground/` 下内容为实验性，不作为主线代码依据。

## 3) 代码与架构规划
### 3.1 目标目录
- `src/bills_analysis/api/`：FastAPI routes（HTTP 输入输出）
- `src/bills_analysis/services/`：业务编排（process/review/merge）
- `src/bills_analysis/integrations/`：外部适配（azure/excel/storage/queue/repo）
- `src/bills_analysis/models/`：schema/contract（API、任务、结果模型）
- `src/bills_analysis/workers/`：异步任务处理（queue consumer）
- `frontend/`：前端工程（SWA 部署）

### 3.2 代码生成要求
- 对新增或者修改的函数、class定义，或者新脚本，必须有注释，可以视功能复杂度选择一句话或者一段话注释，统一用3对引号的形式。
- 对于枚举定义，需要给出注释（每个enum项后用#号注释即可），但如果是通过Pydantic定义的枚举类，也要遵循上述对类的注释要求。


## 4) Task-Based Worktree Workflow（核心）

### 4.1 Workflow Overview

本项目采用任务 worktree 模式，每个功能点（task）在独立 worktree 中开发：

1. **PM Role**（main 分支）：仅负责创建任务定义和分配 `task_id`，不直接编码。
2. **Task Execution**：基于 task ID 创建 worktree，在内部完成 planning → implementation → testing。
3. **Integration**：同步 main → 完整回归测试 → 合并回 main。

### 4.2 File Scope Guidance

在单个任务 worktree 中允许同时修改前后端文件，但应保持语义清晰：

- Frontend scope：`frontend/**`、前端相关文档
- Backend scope：`src/bills_analysis/**`、`tests/*.py`
- 跨范围任务（如新 API + frontend integration）可在同一 worktree 完成
- 通过语义指导控制 Agent 上下文范围，避免过长的上下文导致偏移

详见 `.claude/rules/collaboration-boundaries.md`。

### 4.3 Branch & Commit Conventions

- 分支命名：`feat/<task_id>-<slug>`（例如 `feat/TC-007-batch-delete`）
- Commit 前缀：`<task_id>: <描述>`（例如 `TC-007: add batch delete endpoint and UI`）
- 允许在单个 commit 中同时包含前后端改动，要求围绕同一 task_id 且原子
- 建议在可能时拆分为多个 commit 以保持历史清晰，但不强制

### 4.4 API 契约优先
- 统一读 `src/bills_analysis/models/` 中的 schema。
- API 变更必须先更新 schema，再更新调用方（即使在同一 worktree 中也应遵循此顺序）。
- `v1` 在 M1 期间冻结，breaking change 禁止。如必须变更，先版本升级并在 `findings.<plan_id>.md` 中记录风险和迁移建议。

### 4.5 配置与密钥
- `.env` 不入库。
- 示例放 `.env.example`。
- 阈值与业务参数统一走 `tests/config.json`（后续迁移到 `config/`）。

### 4.6 Regression Gate

Task worktree 合并回 main 前必须通过：

```bash
# 1. 同步 main
git merge main

# 2. Backend contract test
uv run pytest tests/test_api_schema_v1.py -q

# 3. Frontend tests
pnpm --dir frontend test

# 4. (可选) E2E smoke test
# uv run pytest tests/test_api_e2e_smoke.py -q  # 待创建
```

### 4.7 Worktree Lifecycle Example

```bash
# 1. PM 在 main 上创建 task（plans/todo_current.md, UNPLANNED）

# 2. 创建 worktree
git worktree add -b feat/TC-007-batch-delete ../wt-TC-007 main
cd ../wt-TC-007

# 3. Planning
python scripts/plan_tracker.py quick-plan --task-ids TC-007
# 或使用 /planning-with-files skill

# 4. Implementation（前后端均可修改）

# 5. Sync main + regression
git merge main
uv run pytest tests/test_api_schema_v1.py -q
pnpm --dir frontend test

# 6. Merge to main
git checkout main
git merge feat/TC-007-batch-delete

# 7. Cleanup
git worktree remove ../wt-TC-007
```



## 5) 里程碑（全局视角）
- **M1: MVP 本地全流程闭环**（当前）：完成上传→提取→人工校验→merge 入账的完整 Web App 流程，前后端联调通过，本地可运行。包含：后端迁移到分层架构、前端基于 `v1` 契约开发调用链路、API 稳定开放、前端闭环与 merge 结果页对齐。
- **M2: Docker Demo**：将前后端封装为 Docker 容器（docker compose），用户可在本地一键启动试用。
- **M3: Azure 上线**：基于 Azure 基础设施（SWA + Functions/Container Apps）正式部署上线。

当前里程碑待实现功能点见 `plans/todo_current.md`；未来里程碑功能点见 `plans/todo_future.md`。

## 5.1 启动与验证最小命令
- 旧流程（真实业务链）：  
  - daily场景：`uv run python tests/run_with_category.py --bar-dir <bar_dir> --zbon <zbon.pdf> --run_date 04/02/2026`
  - office场景：`uv run python tests/run_with_category.py --office-dir <office_dir> --run_date 04/02/2026`
- 新 API 启动：  
  `uv run invoice-web-api`
- API 健康检查：  
  `GET http://127.0.0.1:8000/healthz`
- Schema 契约测试：  
  `uv run pytest tests/test_api_schema_v1.py -q`
- 导出 OpenAPI v1 基线：  
  `uv run python scripts/export_openapi_v1.py`

## 5.2 当前里程碑冻结点（M1）
- `v1` API schema 已冻结（`src/bills_analysis/models/`）。
- 非兼容变更禁止：不得删除/重命名/改类型已发布字段。
- 如需变更，必须先版本升级（如 `v1.1`/`v2`）并在 `findings.<plan_id>.md` 标注 breaking change 风险和迁移建议。
- 并行开发期间，前端默认对接 `v1` 冻结契约；后端内部重构不得改变 `v1` 对外字段与语义。

## 5.3 Task Tracking
- `plans/todo_current.md`：当前里程碑任务主表（结构化字段：`task_id/task/status/plan_id/updated_at/note`）。
- 状态机固定：`UNPLANNED -> PLANNED -> DONE`，并要求 `PLANNED` / `DONE` 必须绑定 `plan_id`。
- `plans/workplans/`：每个 plan 的三文件上下文（`task_plan/findings/progress`）。
- `plans/todo_future.md`：未来里程碑的功能点，仅记录参考，暂不实现。
- 任务状态更新优先通过 `python scripts/plan_tracker.py ...` 维护，减少多人并行编辑冲突。
- 详细规则：`.claude/rules/planning-with-files.md`
- 操作手册：`plans/workplans/README.md`

## 5.4 Planning-with-files（索引）
- 本仓库的 `/planning-with-files` 采用 task-tracker + workplans 机制，支持用户指定范围与 agent 自主选题并行推进。
- 触发语义、并行约束、命令契约等稳定规则统一维护在：`.claude/rules/planning-with-files.md`。
- 日常使用命令与示例统一维护在：`plans/workplans/README.md`。

## 6) 从本地 Excel 过渡到 Lark 的目标工作流
当前流程：`PDF -> 识别 JSON -> 待校验 Excel -> 人工修正 -> merge Excel`。

目标流程（Web App）：
1. 用户在 Web App 选择类型（daily/office）、上传 PDF、设置 run_date。
2. 后端异步处理（提取 + 压缩归档 + 预览链接）并产出待校验数据（JSON/DB）。
3. 前端展示可编辑表单（替代本地“待校验 Excel”）并提供 PDF 预览按钮。
4. 用户确认后点击 merge。
5. 后端将确认数据写入标准中间层，再调用 Lark API 写入目标表。
6. Web App 返回 merge 结果（成功条数、失败条数、失败原因、导出链接）。

Lark 接入策略：
- 支持前端输入 Lark 链接，但默认不建议业务用户手填完整链接。
- 推荐后端配置 `app_id/app_secret/base_id/table_id`，前端仅选择目标模板，降低误填风险。
- 所有 merge 写入需保留审计日志（操作者、时间、目标表、变更摘要）。

## 7) Definition of Done（每个任务）
- 功能可运行（本地最小命令）
- 有日志和错误提示
- 不破坏既有脚本主流程
- 文档同步更新（README + plan 三文件 progress/findings）

## 8) Skills 使用约定
### 8.1 前端 Skills 的规则
- 前端设计与页面构建任务，默认启用 `frontend-design`。
- React/Next.js 相关开发、重构、性能优化任务，默认启用 `vercel-react-best-practices`。
- 触发方式：
  - 在需求中显式写 `$frontend-design` 或 `$vercel-react-best-practices`。
  - 或任务描述明确属于对应 skill 的适用范围（如组件构建、页面设计、React 性能优化等）。
- Skill 文件路径约定：`/.agents/skills/**/SKILL.md`。
- 若 skill 缺失、未安装或路径不可读，需在回复中明确说明，并使用常规方案继续执行。

### 8.2 Task Worktree Lifecycle Skill
- 当任务包含完整 worktree 生命周期操作（创建 worktree、同步配置、环境初始化、回归前同步 `dev`、合并回 `dev`）时，使用 `task-worktree-lifecycle`。
- 详细文档：`.agents/skills/task-worktree-lifecycle/SKILL.md`
