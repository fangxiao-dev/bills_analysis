# Frontend M1 (React + Vite + Tailwind)

M1 frontend for bills upload workflow. This app follows frozen `v1` backend contracts under `src/bills_analysis/models/`.

## Stack
- React 18 + Vite
- Tailwind CSS
- JavaScript + JSDoc + Zod runtime schemas
- Vitest + Testing Library

## Quick start
1. Enable pnpm via corepack (preferred):
   - `corepack enable`
   - `corepack prepare pnpm@latest --activate`
2. Install dependencies:
   - `pnpm install`
3. Run dev server:
   - `pnpm dev`
4. Run tests:
   - `pnpm test`
5. Run real API smoke (requires backend running on `VITE_API_BASE_URL`):
   - `pnpm smoke:real`

## Environment
Copy `.env.example` as `.env.local` and adjust when needed:

- `VITE_API_MODE=mock|real`
- `VITE_API_BASE_URL=http://127.0.0.1:8000`

Default mode is `mock`.

Smoke command env overrides:
- `VITE_API_BASE_URL` or `API_BASE_URL` (default `http://127.0.0.1:8000`)
- `SMOKE_RUN_DATE` (`DD/MM/YYYY`, default today)
- `SMOKE_REVIEW_TIMEOUT_MS`, `SMOKE_MERGE_TIMEOUT_MS`, `SMOKE_POLL_INTERVAL_MS`
- `SMOKE_STUCK_STATUS_TIMEOUT_MS`, `SMOKE_STATUS_LOG_INTERVAL_MS`
- `SMOKE_DAILY_EXCEL_PATH` (daily merge 使用的 excel 路径，默认 `data/daily_excel_sample.xlsx`)
- `SMOKE_OFFICE_EXCEL_PATH` (office merge/append 使用的 excel 路径，默认 `data/monthly_excel_sample.xlsx`)
- `SMOKE_DAILY_ZBON_FILE`, `SMOKE_DAILY_BAR_FILE`, `SMOKE_OFFICE_APPEND_FILE`, `SMOKE_OFFICE_OVERWRITE_FILE` (real PDF file paths)

## API Mode Strategy
- `mock`: full frontend flow without backend upload endpoint.
- `real`: uses current `/v1/batches*` backend endpoints.
- Real multipart upload is intentionally deferred. Upload details must stay inside `uploadClient.real` only.

## Folder highlights
- `src/contracts/`: strict v1 runtime schemas and JSDoc typedefs
- `src/features/upload/api/`: mock/real upload clients and mode switch
- `src/features/upload/state/`: reducer + flow hook with polling/retry
- `src/features/upload/pages/BillUploadPage.jsx`: M1 upload page

## Contract alignment
Current client contracts map to:
- `POST /v1/batches`
- `GET /v1/batches`
- `GET /v1/batches/{batch_id}`
- `PUT /v1/batches/{batch_id}/review`
- `POST /v1/batches/{batch_id}/merge`

Validation notes:
- `run_date` follows `DD/MM/YYYY`
- unknown fields are rejected in runtime schema parsing
- enums match backend values 1:1

## Pre-release Checklist
- Run frontend full suite: `pnpm test`
- Run real smoke with valid sample PDFs and excel paths: `pnpm smoke:real`
- Verify three smoke cases reach `merged`:
  - `daily-overwrite`
  - `office-append`
  - `office-overwrite`
- Confirm frontend review submit payload keeps canonical nested shape:
  - `{ row_id, category, filename, result, score, preview_path? }`

## Retry And Failure Alignment
- Backend health unavailable:
  - Check `GET /healthz` first, then retry smoke after backend recovery.
- Validation `422` on review submit:
  - Frontend must surface parsed field-level error details from FastAPI `detail`.
  - Fix payload field values in ManualReview and resubmit canonical payload.
- Merge `failed` status:
  - Keep reviewed rows and allow merge retry with corrected excel source path.
  - Re-run only failed case after updating `SMOKE_DAILY_EXCEL_PATH` / `SMOKE_OFFICE_EXCEL_PATH`.
