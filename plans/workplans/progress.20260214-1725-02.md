# Progress Log (20260214-1725-02) — 前后端合作 Plan

## Session: 2026-02-14

### Phase 1: Planning
- **Status:** complete
- **Started:** 2026-02-14T17:25
- Actions taken:
  - 从 plan 20260214-1713 拆分出前后端合作任务 TC-003, TC-006
  - 创建 plan 20260214-1725-02
  - 详细分析前后端职责矩阵
  - 定义 contract 扩展建议（inputs[].status, merge_output.output_path）
  - 写入 task_plan 和 findings
- **Next:** Phase 2 — 将 contract 扩展建议同步给 backend agent，同时前端可用降级方案先行开发

### Phase 2: Backend Delivery (agent-b)
- **Status:** complete
- **Finished at:** 2026-02-14
- Actions taken:
  - 已在后端模型 `InputFile` 增加 optional 字段：`status`, `error`
  - 已在 batch 创建时初始化 `inputs[].status=\"queued\"`
  - 已在 worker 生命周期写入输入状态：
    - process 开始：`processing`
    - process 成功：`extracted`
    - process 失败：`failed` + `error`
  - 已在 merge 输出新增 `merge_output.output_path`（并保留 `merged_excel_path` 兼容）
- Frontend dependencies（请 frontend 按此消费）:
  - TC-003:
    - 从 `GET /v1/batches/{id}` 读取 `inputs[].status` 和 `inputs[].error`
    - 状态值按后端约定：`queued|processing|extracted|failed`
  - TC-006:
    - 从 `batch.merge_output.output_path` 生成“Ergebnis öffnen/anzeigen”入口
    - 若为空则保持按钮禁用（与当前设计一致）

## Test Results
| Test | Input | Expected | Actual | Status |
|---|---|---|---|---|
| (pending Phase 5) | | | | |
| `uv run pytest tests/test_api_schema_v1.py tests/test_api_e2e_smoke.py -q` | API contract + e2e smoke | 新字段可用且链路无回归 | 33 passed | ✓ |
| `uv run python scripts/export_openapi_v1.py` | v1 baseline snapshot | openapi baseline 跟随 optional 字段扩展更新 | generated `tests/openapi_v1_baseline.json` | ✓ |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|---|---|---|---|
| (none yet) | | | |
