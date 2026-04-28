# Statistics Dashboard Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an M1 statistics dashboard that uploads Daily/Bar and Office monthly Excel files, aggregates revenue, expenses, profit, and Office type breakdowns, and displays them in the React UI.

**Architecture:** Add a backend Excel aggregation service and an additive `/v1/statistics/monthly-preview` endpoint. Keep accounting rules in Python models/services, then consume the response from a new frontend statistics feature.

**Tech Stack:** FastAPI, Pydantic, openpyxl, pytest, React, Vite, Vitest, Playwright mock tests.

---

## Task 1: Add Statistics Response Models

**Files:**

- Modify: `src/bills_analysis/models/api_responses.py`
- Test: `tests/test_api_schema_v1.py`

**Step 1: Write failing model tests**

Add tests that instantiate:

- `StatisticsSummary`
- `DailyStatisticsPoint`
- `OfficeTypeBreakdown`
- `OfficeStatisticsRow`
- `MonthlyStatisticsResponse`

Expected assertions:

- `schema_version == "v1"`
- unknown fields are rejected through `StrictModel`
- numeric fields accept normal Python numbers
- `warnings` defaults to an empty list

**Step 2: Run the focused tests**

Run:

```powershell
uv run pytest tests/test_api_schema_v1.py -q
```

Expected: fail because the models do not exist.

**Step 3: Implement models**

Add to `src/bills_analysis/models/api_responses.py`:

```python
class StatisticsSummary(StrictModel):
    """Top-level monthly financial totals for the statistics dashboard."""

    revenue_brutto: float = 0
    daily_expense_brutto: float = 0
    office_expense_brutto: float = 0
    profit_brutto: float = 0


class DailyStatisticsPoint(StrictModel):
    """One daily revenue/expense point for trend charts."""

    date: str
    revenue_brutto: float = 0
    daily_expense_brutto: float = 0
    profit_before_office_brutto: float = 0


class OfficeTypeBreakdown(StrictModel):
    """Office spending aggregation for one type."""

    type: str
    brutto: float = 0
    count: int = 0
    share: float = 0


class OfficeStatisticsRow(StrictModel):
    """One Office row used for type drilldown."""

    date: str | None = None
    type: str
    name: str | None = None
    brutto: float = 0


class MonthlyStatisticsResponse(StrictModel):
    """Statistics preview response for uploaded monthly Excel files."""

    schema_version: Literal["v1"] = SCHEMA_VERSION
    summary: StatisticsSummary
    daily_series: list[DailyStatisticsPoint] = Field(default_factory=list)
    office_by_type: list[OfficeTypeBreakdown] = Field(default_factory=list)
    office_rows: list[OfficeStatisticsRow] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
```

**Step 4: Run tests**

Run:

```powershell
uv run pytest tests/test_api_schema_v1.py -q
```

Expected: pass except any OpenAPI baseline changes that are not introduced yet.

**Step 5: Commit**

```powershell
git add src/bills_analysis/models/api_responses.py tests/test_api_schema_v1.py
git commit -m "feat: add statistics response models"
```

## Task 2: Implement Excel Statistics Service

**Files:**

- Create: `src/bills_analysis/services/statistics_service.py`
- Test: `tests/test_statistics_service.py`

**Step 1: Write failing service tests**

Create temporary `.xlsx` files with openpyxl.

Test cases:

- Daily workbook with `Umsatz Brutto`, `Ausgabe 1 Brutto`, `Ausgabe 2 Brutto`; Office workbook with `Type`, `Rechnung Name`, `Brutto`.
- `Ausgabe sum Brutto` exists but does not change the total.
- Office type aggregation sorts by `brutto` descending.
- Missing Daily required field raises `ValueError`.
- Missing Office required field raises `ValueError`.
- Non-numeric amount produces warning and contributes `0`.

**Step 2: Run failing tests**

Run:

```powershell
uv run pytest tests/test_statistics_service.py -q
```

Expected: fail because the service does not exist.

**Step 3: Implement service**

Create:

```python
from __future__ import annotations

import re
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from openpyxl import load_workbook

from bills_analysis.models.api_responses import (
    DailyStatisticsPoint,
    MonthlyStatisticsResponse,
    OfficeStatisticsRow,
    OfficeTypeBreakdown,
    StatisticsSummary,
)

DAILY_EXPENSE_BRUTTO_RE = re.compile(r"^Ausgabe \d+ Brutto$")
UNCATEGORIZED_OFFICE_TYPE = "Uncategorized"
```

Implement helpers:

- `_headers(ws) -> dict[str, int]`
- `_required(headers, names, workbook_label)`
- `_to_decimal(value, warnings, label) -> Decimal`
- `_date_text(value) -> str | None`
- `_round_money(value: Decimal) -> float`

Main function:

```python
def build_monthly_statistics(daily_xlsx: Path, office_xlsx: Path) -> MonthlyStatisticsResponse:
    ...
```

Use `Decimal` internally and convert to floats in the response.

**Step 4: Run focused tests**

Run:

```powershell
uv run pytest tests/test_statistics_service.py -q
```

Expected: pass.

**Step 5: Commit**

```powershell
git add src/bills_analysis/services/statistics_service.py tests/test_statistics_service.py
git commit -m "feat: aggregate monthly statistics from excel"
```

## Task 3: Add Monthly Statistics API Endpoint

**Files:**

- Modify: `src/bills_analysis/api/main.py`
- Modify: `tests/test_api_schema_v1.py`
- Modify: `tests/openapi_v1_baseline.json`

**Step 1: Write failing API tests**

Add tests using `TestClient`:

- `POST /v1/statistics/monthly-preview` with two valid Excel files returns `200`.
- Response contains `summary.profit_brutto`.
- Missing one file returns `422`.
- Invalid file extension returns `400`.

Build in-memory workbook bytes for tests.

**Step 2: Run failing tests**

Run:

```powershell
uv run pytest tests/test_api_schema_v1.py -q
```

Expected: fail with 404 for missing endpoint.

**Step 3: Implement endpoint**

In `src/bills_analysis/api/main.py`:

- Import `MonthlyStatisticsResponse`.
- Import `build_monthly_statistics`.
- Add route before static mount:

```python
@app.post("/v1/statistics/monthly-preview", response_model=MonthlyStatisticsResponse)
async def preview_monthly_statistics(
    daily_excel: UploadFile = File(...),
    office_excel: UploadFile = File(...),
) -> MonthlyStatisticsResponse:
    ...
```

Implementation:

- Validate both files with `_validate_excel_upload`.
- Save under `outputs/webapp/statistics/<uuid>/`.
- Call `build_monthly_statistics`.
- Convert `ValueError` into HTTP 422.
- Convert unreadable workbook errors into HTTP 400 where practical.

**Step 4: Update OpenAPI baseline**

Run:

```powershell
uv run python scripts/export_openapi_v1.py
```

Review the diff and keep only expected additive endpoint/schema changes.

**Step 5: Run tests**

Run:

```powershell
uv run pytest tests/test_api_schema_v1.py tests/test_statistics_service.py -q
```

Expected: pass.

**Step 6: Commit**

```powershell
git add src/bills_analysis/api/main.py tests/test_api_schema_v1.py tests/openapi_v1_baseline.json
git commit -m "feat: expose monthly statistics preview api"
```

## Task 4: Add Daily Ausgabe Sum Columns

**Files:**

- Modify: `src/bills_analysis/integrations/excel_merge_adapter.py`
- Possibly modify: `src/bills_analysis/integrations/excel_mapper_adapter.py`
- Test: `tests/test_merge_parity.py`
- Test: `tests/test_api_schema_v1.py`

**Step 1: Write failing tests**

Add tests:

- Missing daily monthly template creation includes `Ausgabe sum Brutto` and `Ausgabe Sum Netto`.
- Merging a daily validated workbook writes Brutto and Netto sum values.
- Existing workbooks without the columns remain supported; do not break old templates.

**Step 2: Run failing tests**

Run:

```powershell
uv run pytest tests/test_merge_parity.py tests/test_api_schema_v1.py -q
```

Expected: fail because the columns are not generated.

**Step 3: Implement template and row sum logic**

In `_build_daily_template_headers`, append:

```python
"Ausgabe sum Brutto",
"Ausgabe Sum Netto",
```

Add helpers:

- `_sum_daily_expense_columns(row_values, headers, suffix) -> float | None`
- `_write_daily_expense_sums(ws, target_row, header_to_col) -> None`

After writing daily row values in `merge_daily_excel`, compute sums from `Ausgabe <N> Brutto` and `Ausgabe <N> Netto` columns if the target workbook has the sum columns.

**Step 4: Run focused tests**

Run:

```powershell
uv run pytest tests/test_merge_parity.py tests/test_api_schema_v1.py -q
```

Expected: pass.

**Step 5: Commit**

```powershell
git add src/bills_analysis/integrations/excel_merge_adapter.py tests/test_merge_parity.py tests/test_api_schema_v1.py
git commit -m "feat: add daily expense sum columns"
```

## Task 5: Add Frontend Statistics API Client

**Files:**

- Create: `frontend/src/features/statistics/api/statisticsClient.js`
- Create: `frontend/src/features/statistics/api/statisticsClient.real.js`
- Create: `frontend/src/features/statistics/api/statisticsClient.mock.js`
- Create: `frontend/src/features/statistics/api/statisticsClient.real.test.js`
- Modify: `frontend/src/config/env.js` only if current API mode selection needs a new import path.

**Step 1: Write failing client tests**

Test:

- real client sends multipart fields named `daily_excel` and `office_excel`.
- real client calls `/v1/statistics/monthly-preview`.
- mock client returns deterministic summary and office type rows.

**Step 2: Run failing tests**

Run:

```powershell
cd frontend
pnpm test -- statisticsClient.real.test.js
```

Expected: fail because files do not exist.

**Step 3: Implement clients**

Real client shape:

```js
export async function previewMonthlyStatistics({ dailyExcel, officeExcel }) {
  const formData = new FormData();
  formData.append("daily_excel", dailyExcel);
  formData.append("office_excel", officeExcel);
  const response = await fetch(`${API_BASE_URL}/v1/statistics/monthly-preview`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
```

Keep the exported facade consistent with upload client mode selection.

**Step 4: Run client tests**

Run:

```powershell
cd frontend
pnpm test -- statisticsClient
```

Expected: pass.

**Step 5: Commit**

```powershell
git add frontend/src/features/statistics/api
git commit -m "feat: add statistics api client"
```

## Task 6: Build Statistics Page UI

**Files:**

- Create: `frontend/src/features/statistics/pages/StatisticsPage.jsx`
- Create: `frontend/src/features/statistics/components/StatisticsUploadPanel.jsx`
- Create: `frontend/src/features/statistics/components/KpiStrip.jsx`
- Create: `frontend/src/features/statistics/components/ProfitBridgeChart.jsx`
- Create: `frontend/src/features/statistics/components/DailyTrendChart.jsx`
- Create: `frontend/src/features/statistics/components/OfficeTypeBreakdown.jsx`
- Modify: `frontend/src/app/routes.jsx`
- Modify: `frontend/src/app/AppFrame.jsx`
- Modify: `frontend/src/i18n/locales/de.json`
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/zh.json`
- Test: `frontend/src/features/statistics/pages/StatisticsPage.test.jsx`

**Step 1: Write failing page tests**

Test:

- page renders two Excel file inputs.
- generate button is disabled until both files are selected.
- successful preview renders four KPI values.
- Office type click filters/shows rows for that type.
- warnings are displayed.

**Step 2: Run failing tests**

Run:

```powershell
cd frontend
pnpm test -- StatisticsPage
```

Expected: fail because the page does not exist.

**Step 3: Implement page and components**

UI behavior:

- Keep first screen as the actual statistics tool, not a landing page.
- Use compact operational layout consistent with existing app.
- Use native SVG for charts.
- Do not put page sections inside nested cards.
- Use stable dimensions for chart areas to prevent layout shifts.
- Use `Intl.NumberFormat` for EUR-style financial display.

Routing:

- Add `/statistics` route.
- Add navigation item with i18n label.

**Step 4: Run frontend tests**

Run:

```powershell
cd frontend
pnpm test
```

Expected: pass.

**Step 5: Commit**

```powershell
git add frontend/src/features/statistics frontend/src/app/routes.jsx frontend/src/app/AppFrame.jsx frontend/src/i18n/locales
git commit -m "feat: add statistics dashboard page"
```

## Task 7: Add Mock E2E Coverage

**Files:**

- Create: `frontend/e2e/mock/statistics.spec.ts`
- Modify: `frontend/e2e/support/mockApi.ts`

**Step 1: Write failing Playwright test**

Flow:

1. Open `/statistics`.
2. Attach fixture `.xlsx` files or intercept API directly if file upload fixture is not needed.
3. Click generate.
4. Assert KPI values are visible.
5. Click an Office type.
6. Assert type detail rows are visible.

**Step 2: Run failing E2E**

Run:

```powershell
cd frontend
pnpm playwright:mock
```

Expected: fail until mock handler and page are wired.

**Step 3: Implement mock handler**

In `frontend/e2e/support/mockApi.ts`, intercept:

```text
POST **/v1/statistics/monthly-preview
```

Return deterministic response matching the backend contract.

**Step 4: Run mock E2E**

Run:

```powershell
cd frontend
pnpm playwright:mock
```

Expected: pass.

**Step 5: Commit**

```powershell
git add frontend/e2e/mock/statistics.spec.ts frontend/e2e/support/mockApi.ts
git commit -m "test: cover statistics dashboard e2e"
```

## Task 8: Final Verification

**Files:**

- No new files unless fixing issues found by verification.

**Step 1: Run backend verification**

Run:

```powershell
uv run pytest tests/test_statistics_service.py tests/test_api_schema_v1.py tests/test_merge_parity.py -q
```

Expected: pass.

**Step 2: Run frontend verification**

Run:

```powershell
cd frontend
pnpm test
pnpm build
pnpm playwright:mock
```

Expected: pass.

**Step 3: Review git diff**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only statistics-related files changed.

**Step 4: Commit any verification fixes**

If verification required follow-up fixes:

```powershell
git add <fixed-files>
git commit -m "fix: stabilize statistics dashboard"
```

## Open Product Decision

`Office Type` 为空时，本 plan 使用 `Uncategorized`。如果 product copy should remain German or Chinese, change the constant and i18n labels before implementing Task 2.
