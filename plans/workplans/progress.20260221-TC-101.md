# Progress Log (20260221-TC-101)

## Session: 2026-02-21

### Phase 1: Requirements & Discovery — DONE
- Plan 三文件创建完成，需求已明确，findings 已记录
- 已确认在 `feat/TC-101-office-prompt-tuning` worktree 执行

### Phase 2: Planning & Structure — DONE
- 实现步骤已在 task_plan.md 中定义（Step 0 ~ Step 9）
- 依赖关系已确认

### Phase 3: Implementation — DONE
已完成步骤：
- [x] Step 0: `local_backend.py` 新增 `di_fields/<row_id>.json` 落盘
- [x] Step 1: `api_responses.py` 新增 `ReportTypeCorrection` / `ReportErrorResponse`
- [x] Step 2: `batch_service.py` 新增 `report_type_error` + `_compute_type_corrections`
- [x] Step 3: `api/main.py` 新增 `POST /v1/batches/{batch_id}/report-error`
- [x] Step 4: 重新导出 OpenAPI baseline
- [x] Step 5: Frontend client (real + mock) 新增 `reportTypeError`
- [x] Step 6: `useUploadFlow.js` 新增 `reportTypeError` action
- [x] Step 7: `ManualReviewPage.jsx` 新增按钮 + feedback 提示
- [x] Step 8: i18n keys (en/de/zh) 已补齐
- [x] Step 9: `.gitignore` 添加 `dataset/*`

### Phase 4: Testing — DONE
- Backend targeted RED/GREEN:
  - `uv run pytest tests/test_api_schema_v1.py -q -k "report_error_endpoint or persists_office_di_fields_artifact"`
- Backend regression gate:
  - `uv run pytest tests/test_api_schema_v1.py -q`
- Frontend targeted RED/GREEN:
  - `cmd /c pnpm --dir frontend test -- --run src/features/upload/api/uploadClient.real.test.js src/features/upload/state/useUploadFlow.test.js src/features/upload/pages/ManualReviewPage.test.jsx`
- Frontend regression gate:
  - `cmd /c pnpm --dir frontend test`

### Phase 5: Delivery — DONE
- Plan 文件已更新，准备进入 trunk merge 流程

### Phase 6: Follow-up UI Fixes — DONE
根据手动验收反馈，补充修复了两个前端交互问题：
- [x] `Report Type Error` 按钮状态机收紧为“仅当前页面本次提交成功后可用；上报成功后立即失效”
- [x] 本地 Excel 选择区域改为“按钮触发隐藏 input”，修复右侧空白区域误触发文件选择
- [x] 完成态提示合并为单条文案，避免重复提示

补充验证：
- `cmd /c pnpm.cmd --dir frontend test -- --run src/features/upload/pages/ManualReviewPage.test.jsx`
- `cmd /c pnpm.cmd --dir frontend test -- --run src/features/upload/pages/ManualReviewPage.test.jsx src/features/upload/state/useUploadFlow.test.js src/features/upload/state/uploadFlowReducer.test.js`
- 结果：相关测试通过（当前前端回归统计为 75 passed）

## Test Results
| Test | Input | Expected | Actual | Status |
|---|---|---|---|---|
| backend-targeted | `uv run pytest ... -k "report_error_endpoint or persists_office_di_fields_artifact"` | 新增后端行为测试通过 | 2 passed | ✅ |
| backend-contract | `uv run pytest tests/test_api_schema_v1.py -q` | v1 contract 全量通过 | 36 passed | ✅ |
| frontend-targeted | `cmd /c pnpm --dir frontend test -- --run ...` | 新增前端行为测试通过 | 66 passed | ✅ |
| frontend-regression | `cmd /c pnpm --dir frontend test` | 前端全量测试通过 | 66 passed | ✅ |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|---|---|---|---|
| 2026-02-21 | `pnpm.ps1 cannot be loaded` (PowerShell execution policy) | 使用默认 `pnpm` 直接执行 | 改为 `cmd /c pnpm ...` 运行 |
| 2026-02-21 | Vitest startup `spawn EPERM`（沙箱） | sandbox 内执行 frontend test | 申请提权后执行测试通过 |
| 2026-02-21 | WT-PM 环境同步步骤执行时机偏后 | 先在 `wt-TC-101` 执行 sync（源目录无 `.env`） | 按你指出改为在 `dev` 执行 sync dry-run/apply，同步 `.env` 与 `frontend/.env.local` 到 `wt-TC-101` 并完成 hash 校验 |
| 2026-02-21 | `Report Type Error` 在存在历史 review 计数时仍可点击 | 仅依赖 `review_rows_count` / 全局状态判断按钮可用性 | 改为本页 submit 成功后设置本地 armed 状态，点击上报成功后解除 |
| 2026-02-21 | 本地 Excel 选择控件右侧空白可触发文件选择 | 原生 file input 可点击区域超出视觉预期 | 改为“Choose File 按钮 + 隐藏 input”触发模型 |
