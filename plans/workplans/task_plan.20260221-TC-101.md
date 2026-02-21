# Task Plan: 20260221-TC-101

## Goal

在 review 页面为 office 模式添加"Report Type Error"按钮，一键将 batch 中间结果复制到 `dataset/type_errors/` 目录，供开发者后续分析并改进 GPT-4o-mini 分类 prompt。

## Scope

- TC-101: Office type 错误样本收集

## Implementation Steps

### Step 0 — 保存 DI distilled fields 落盘（`local_backend.py`）
- 在 `_fill_office_row` 中，`distilled = _clean_invoice_fields(office_fields)` 之后
- 写入 `outputs/webapp/<batch_id>/di_fields/<row_id>.json`

### Step 1 — Backend Model（`api_responses.py`）
- 新增 `ReportErrorResponse(schema_version, status, corrections)`

### Step 2 — Backend Service（`batch_service.py`）
- 新增 `report_type_error(batch_id)` — 对比 results.json vs review_rows_submitted.json，复制目录
- 新增 `_compute_type_corrections()` — 提取 type 差异列表

### Step 3 — Backend Route（`api/main.py`）
- 新增 `POST /v1/batches/{batch_id}/report-error`

### Step 4 — 重新生成 OpenAPI Baseline
- `uv run python scripts/export_openapi_v1.py`
- `uv run pytest tests/test_api_schema_v1.py -q`

### Step 5 — Frontend Client
- `uploadClient.real.js`: 新增 `reportTypeError(batchId)`
- `uploadClient.mock.js`: 新增同名 mock 方法

### Step 6 — State Hook（`useUploadFlow.js`）
- 新增 `reportTypeError` action

### Step 7 — UI Button（`ManualReviewPage.jsx`）
- 新增 state: `reportingError`, `reportFeedback`
- 新增 handler: `onReportTypeError`
- 按钮条件: `effectiveBatchType === "office" && hasSubmittedReview`
- Feedback banner 显示结果

### Step 8 — i18n Keys（3 个 locale 文件）
- 新增 5 个 `review.reportError.*` key

### Step 9 — `.gitignore`
- 添加 `dataset/`

## Key Files

| 文件 | 操作 |
|---|---|
| `src/bills_analysis/integrations/local_backend.py` | 新增 di_fields 落盘 |
| `src/bills_analysis/models/api_responses.py` | 新增 ReportErrorResponse |
| `src/bills_analysis/services/batch_service.py` | 新增 report_type_error / _compute_type_corrections |
| `src/bills_analysis/api/main.py` | 新增 POST endpoint |
| `frontend/src/features/upload/api/uploadClient.real.js` | 新增 reportTypeError |
| `frontend/src/features/upload/api/uploadClient.mock.js` | 新增 mock |
| `frontend/src/features/upload/state/useUploadFlow.js` | 新增 action |
| `frontend/src/features/upload/pages/ManualReviewPage.jsx` | 新增按钮 + feedback |
| `frontend/src/i18n/locales/*.json` | 新增 i18n keys |
| `.gitignore` | 新增 dataset/ |

## Verification

```bash
# Contract test
uv run pytest tests/test_api_schema_v1.py -q

# Frontend test
pnpm --dir frontend test

# Manual smoke test
# 1. 上传 office PDF → review_ready
# 2. 修改 type → Submit
# 3. 点击 "Report Type Error" → 确认 dataset/type_errors/<batch_id>/ 生成
# 4. 不修改直接 Submit → 点击按钮 → 确认 skipped 提示
```
