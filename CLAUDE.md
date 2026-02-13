# CLAUDE.md

## 1. Project Context

- 项目目标：面向餐馆内部，完成 `daily/office` 两种场景的票据的上传、提取、人工校验、归档预览与最终 merge 入账闭环。

- 当前阶段：`M1`（并行开发）：Backend 迁移已验证流程到分层架构，Frontend 基于冻结契约推进上传与状态链路。

- 当前 API Contract： `v1`（Frozen，当前唯一对接基线）。

技术栈（一句话）：

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

里程碑方向：

- M1：后端迁移 tests 已验证逻辑到 `services/integrations`；前端基于冻结 `v1` contract 开发调用链路。
- M2：稳定开放 API（create batch / query status / submit review / merge）并完成联调。
- M3：完成上传-校验-确认-下载闭环，merge 结果页对齐。

Milestone Status（当前 + 整体）：

- As of `2026-02-13`：项目处于 `M1` 并行开发阶段（Backend 迁移 + Frontend 对接冻结契约）。
- Backend 当前状态：核心流程已在 `tests/` 验证，正在下沉到 `src/bills_analysis/services/` 与 `src/bills_analysis/integrations/`。
- Frontend 当前状态：已按 `v1` 契约推进上传与状态流转页面，联调以 `v1` 字段语义为准。
- 整体进度判断：`M1` 进行中，`M2/M3` 尚未进入冻结验收阶段。

## 4. Collaboration Boundaries

严格边界：

- Frontend session (Agent A) 仅改：
  - `frontend/**`
  - 前端相关文档与 API 调用示例
- Backend session (Agent B) 仅改：
  - `src/bills_analysis/**`
  - 后端相关 `tests/*.py`（迁移期）
  - `README.md` 后端段落

禁止互改：

- 前端不改 `src/bills_analysis/**` 与 `tests/*.py` 业务逻辑。
- 后端不改 `frontend/**` UI/样式/构建配置。

提交约定：

- Backend 分支：`feat-backend*`，commit 前缀：`backend: ...`
- Frontend 分支：`feat-frontend*`，commit 前缀：`frontend: ...`
- 单个 commit 不混合前后端改动。

## 5. API Contract Rules (v1 Frozen)

Current Contract Baseline & Phase：

- 当前对外 contract 版本：`v1`（Frozen）。
- 当前执行阶段：`M1`（并行开发期）。
- 前端默认对接：`src/bills_analysis/models/` 中 `v1` schema，不依赖临时脚本输出。
- 后端改动边界：M1 可重构内部实现，但不得改变 `v1` 对外字段、类型与语义。

契约优先规则：

- 前后端统一以 `src/bills_analysis/models/` 为唯一 contract 来源。
- API 变更必须先更新 schema，再更新调用方。
- `v1` schema 冻结：禁止删除/重命名/改类型已发布字段。
- 如必须做 breaking change：先版本升级（如 `v1.1`/`v2`），并在 `SESSION_NOTES.md` 明确标注。

并行开发规则：

- Frontend 默认仅对接 `v1` 冻结契约，不依赖临时脚本返回结构。
- Backend 在 M1 可重构内部实现，但不得改变 `v1` 对外字段与语义。

## 6. Session Handoff (SESSION_NOTES.md, Fenced JSON)

`SESSION_NOTES.md` 采用 fenced JSON 记录多 Agent 交接（每条记录一个 ` ```json ... ``` ` 代码块）。

字段规范：

- 语言：必须用中文做解释，但技术点可以用英语
- 必填字段：`id`, `ts`, `status`, `scope`, `who`, `what`, `next`
- 可选字段：`dep`, `risk`
- 单状态规则：`status` 固定为 `OPEN`，避免状态枚举膨胀
- `who` 必须包含：`agent`, `side`, `branch`, `head`
- `what` 用数组记录变更事实与动机（`what + why），
- `dep` 只在依赖对方时填写；出现 `dep` 代表需要跨 Agent 跟进
- `next` 必须包含：`goal`, `owner`

写入命令（唯一入口）：

- `python scripts/session_notes.py log --scope "<scope>" --agent <agent> --side <frontend|backend> --what "<what>" --why "<why>" --next-goal "<next-goal>" --next-owner "<owner>"`
- 可重复参数：`--what`、`--dep`、`--risk`
- `id` 默认自动递增（如 `C-001`），可选 `--id` 手工指定
- 当前脚本只解析 fenced JSON 记录；若存在旧单行 JSONL 记录，需先迁移后再继续使用自动递增。

参考记录：

```json
{
  "id": "C-001",
  "ts": "2026-02-13T16:20:00+01:00",
  "status": "OPEN",
  "scope": "upload-review chain",
  "who": {"agent":"agent-a","side":"frontend","branch":"feat-frontend","head":"28997aa"},
  "what": ["打通了 Upload->Review->Submit 的工作流","why:按M1的开发计划"],
  "dep": ["backend: POST /v1/batches/{id}/review-rows accepts {row_id,result:{...}}"],
  "risk": ["仅为 mock API; 实际 real API 还未验证"],
  "next": {"goal":"替换为实际API，并执行smoe test","owner":"agent-a"}
}
```

## 7. Commands You Should Prefer

核心命令（优先）：

- 启动 API：`uv run invoice-web-api`
- Contract 测试：`uv run pytest tests/test_api_schema_v1.py -q`
- 导出 OpenAPI v1：`uv run python scripts/export_openapi_v1.py`
- Frontend 开发：`pnpm dev` / `pnpm test`

## 8. Definition of Done

每个任务完成需满足：

- Contract consistency verified（schema + tests）。
- 功能可运行（按最小命令验证）。
- 有日志和错误提示（可观测）。
- 不破坏既有脚本主流程。
- 新加的class、function等有docstring或者comment
- 如果api model更新，contract 测试需要 pass
- 说明类的文档的按需更新（至少`SESSION_NOTES.md`要按照"6. Session Handoff (SESSION_NOTES.md)"里的更新条件和规则判断）。

## 9. Safety & Change Guardrails

安全与改动约束：

- 禁止跨边界改动（遵循第 4 节）。
- `.env` 不入库，示例配置放 `.env.example`。
- 阈值与业务参数统一走 `tests/config.json`（后续迁移到 `config/`）。
- 所有 merge 写入需保留审计日志（操作者、时间、目标表、变更摘要）。
- 目标流程为：`PDF -> 提取/归档 -> 待校验数据 -> 人工确认 -> merge -> Lark`。

前端并行开发提醒：

- 优先保障上传/状态查询/校验提交/merge 调用链路闭环。
- 若后端 contract 发生版本升级，必须先明确版本切换窗口再联调。

## 10. Maintenance of This File

本文件是仓库级主协作规范，当前为单文件模式。

- 规则扩展路径预留为 `.claude/rules/*.md`，当前阶段暂不拆分。
- 触发更新条件：
  - API contract 发生变化（含版本升级）。
  - 目录边界与职责变化（前后端边界、迁移范围变更）。
  - 标准启动/验证命令变化。
  - DoD 或安全规范变化。
- 更新责任：
  - 发起变更的 session 负责同步更新本文件与 `SESSION_NOTES.md`。
- 冲突处理：
  - 若其他协作文档与本文件冲突，以本文件为准，并在 `SESSION_NOTES.md` 记录原因和日期。
