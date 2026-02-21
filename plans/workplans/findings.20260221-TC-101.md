# Findings & Decisions (20260221-TC-101)

## Requirements
- TC-101: Office type 错误样本收集：在 review 页面添加"Report Type Error"按钮，一键将 batch 中间结果复制到 dataset 目录，供开发者改进 GPT-4o-mini 分类 prompt

## Research Findings

### 数据存储结构

每个 batch 的输出目录 `outputs/webapp/<batch_id>/` 包含：

- `results.json` — 提取阶段写入，保存 AI 原始预测（含 `type` 字段），**不被后续覆写**
- `review_rows.json` — 提交时被 `_persist_review_rows_artifact` 覆写（内容与 submitted 相同）
- `review_rows_submitted.json` — 仅在用户 Submit 后创建，保存用户修正后的值

对比基准：`results.json`（原始 AI 预测）vs `review_rows_submitted.json`（用户修正后）。

### DI 原始输出现状

GPT-4o-mini 的输入是经 `clean_invoice_json()` 清洗后的 `office_fields`（distilled），但这份 dict 目前**没有落盘**。

WebApp 调用路径：
```
local_backend.py::_process_one_file_async
  → _analyze_pdf_with_azure → office_fields（原始 DI fields）
  → _fill_office_row
      → distilled = _clean_invoice_fields(office_fields)  ← 未保存到磁盘
      → _extract_office_semantics(distilled)  → type 字段
```

需要在 `_fill_office_row` 中 `distilled` 生成后立即写文件到 `di_fields/<row_id>.json`。

### 现有前端变量（可直接复用）

`ManualReviewPage.jsx`：
- `effectiveBatchType` (line 40)：`state.batch?.type || state.batchType || "daily"`
- `hasSubmittedReview` (line 131)：`state.reviewSubmitted || review_rows_count > 0`

按钮启用条件直接复用这两个变量。

### v1 Contract 影响

新增 endpoint 和 model 为纯新增，不修改现有字段，符合冻结约束。但需重新生成 OpenAPI baseline，否则 `test_api_schema_v1.py` 会失败。

## Technical Decisions

| Decision | Rationale |
|---|---|
| 对比基准用 `results.json` 而非 `review_rows.json` | `review_rows.json` 在 submit 时被覆写，内容与 submitted 相同，无法区分 |
| dataset 结构：`dataset/type_errors/<batch_id>/` 平铺 | 简单，correction_summary.json 记录 corrected_type，分析脚本按需 group |
| di_fields 粒度：每 row_id 一个文件 | 对应 review_rows 粒度，按文件关联分析 |
| `shutil.copytree(dirs_exist_ok=True)` | 幂等，重复点击安全 |
| 按钮可见条件：`office && hasSubmittedReview` | daily 无 type 字段；submit 前无数据可报告 |
| Feedback setTimeout 4s | 短暂提示不干扰工作流 |

## Issues Encountered

| Issue | Resolution |
|---|---|
| `_fill_office_row` 是否能访问 `out_dir` | 已通过 `batch_out_dir` 显式参数传入，成功落盘 `di_fields/<row_id>.json` |
| `ManualReviewPage` 调用 `reportTypeError` 入参约定不一致 | 将 `useUploadFlow.actions.reportTypeError` 设计为可接收可选 `batchId`，页面侧显式传 `state.batch.batch_id` |

## Final Implementation Notes

- Backend
  - `local_backend.py`：Office 流程在 `_clean_invoice_fields` 后立即持久化 distilled DI fields 到 `outputs/webapp/<batch_id>/di_fields/<row_id>.json`
  - `batch_service.py`：新增 `report_type_error(batch_id)`，对比 `results.json` 与 `review_rows_submitted.json` 计算 type diff
  - `batch_service.py`：有差异时复制整个 batch 输出目录到 `dataset/type_errors/<batch_id>/`，并生成 `correction_summary.json`
  - `api/main.py`：新增 `POST /v1/batches/{batch_id}/report-error`
  - `api_responses.py`：新增 `ReportTypeCorrection` 与 `ReportErrorResponse`

- Frontend
  - `uploadClient.real.js` / `uploadClient.mock.js`：新增 `reportTypeError`
  - `useUploadFlow.js`：新增 `actions.reportTypeError`，统一错误处理
  - `ManualReviewPage.jsx`：新增 `Report Type Error` 按钮（仅 `office && hasSubmittedReview` 可见）与 4s feedback banner
  - i18n：`en/de/zh` 增加 `review.reportError.*` 文案
- `.gitignore`：新增 `dataset/*`，避免错误样本目录入库

### Follow-up Fixes (post manual QA)

- `ManualReviewPage` 上报按钮状态调整：
  - 问题：存在历史 `review_rows_count` 时，按钮可能在当前页未提交前就可点
  - 修复：引入页面本地 `reportTypeErrorArmed`，仅当本页 `submitReviewOnly` 成功后置 `true`，上报成功后置回 `false`
  - 结论：满足“提交前 invalid -> 提交后 valid -> 上报成功后 invalid”

- 本地 Excel 选择交互修复：
  - 问题：原生 file input 在视觉右侧空白区域仍可触发文件选择
  - 修复：改为 `Choose File` 按钮触发隐藏 file input，右侧仅展示文件名文本
  - 结论：仅按钮点击触发文件选择，误触问题消失

- 提示文案收敛：
  - 问题：完成态出现重复提示（可重复提交 + workflow done）
  - 修复：完成态统一显示单条 `review.doneAndResubmitHint`
  - 结论：提示信息更清晰，避免重复语义

## Validation Summary

- OpenAPI baseline 已更新：`uv run python scripts/export_openapi_v1.py`
- Backend contract: `uv run pytest tests/test_api_schema_v1.py -q` -> `36 passed`
- Frontend tests: `cmd /c pnpm --dir frontend test` -> `66 passed`
- Follow-up frontend targeted:
  - `cmd /c pnpm.cmd --dir frontend test -- --run src/features/upload/pages/ManualReviewPage.test.jsx`
  - `cmd /c pnpm.cmd --dir frontend test -- --run src/features/upload/pages/ManualReviewPage.test.jsx src/features/upload/state/useUploadFlow.test.js src/features/upload/state/uploadFlowReducer.test.js`
  - 当前回归统计：`75 passed`

## Workflow Note (WT-PM)

- 本次在已存在 worktree 直接续做任务时，最初遗漏了“在 `dev` 侧执行配置同步”的时机。
- `scripts/sync_worktree_config.ps1` 的同步方向是“当前目录 -> 其他 worktree”，因此若在缺少 `.env` 的 task worktree 执行，无法补齐本地环境文件。
- 已修正做法：在 `dev` 工作目录执行 dry-run + apply，将 `.env` 与 `frontend/.env.local` 同步到 `wt-TC-101`，并用 SHA256 校验一致。

## Resources

- plans/todo_current.md
- plans/workplans/task_plan.20260221-TC-101.md
