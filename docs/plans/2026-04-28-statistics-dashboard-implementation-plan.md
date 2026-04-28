# Statistics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an M1 statistics dashboard that accepts two monthly Excel uploads (Daily/Bar and Office), aggregates revenue, expenses, and profit on the backend, and presents KPIs plus Office type drilldown in the React UI.

**Architecture:** Add `statistics_service.py` as a pure aggregation module and expose it via an additive `POST /v1/statistics/monthly-preview` multipart endpoint. The new `/statistics` frontend feature follows the same `features/<name>/api/pages/components` layout as the existing `upload` feature, using `requestJson` from `lib/http` and native SVG for charts.

**Tech Stack:** FastAPI, Pydantic, openpyxl, shutil, pytest, React, Vite, Vitest, Playwright mock tests.

---

## Task 1: Add Statistics Response Models

**Files:**

- Modify: `src/bills_analysis/models/api_responses.py`
- Test: `tests/test_api_schema_v1.py`

- [ ] **Step 1: Write failing model tests**

Append to `tests/test_api_schema_v1.py`:

```python
# ---------- Statistics models ----------

from bills_analysis.models.api_responses import (
    DailyStatisticsPoint,
    MonthlyStatisticsResponse,
    OfficeStatisticsRow,
    OfficeTypeBreakdown,
    StatisticsSummary,
)


def test_statistics_summary_defaults() -> None:
    """StatisticsSummary should default all amounts to zero."""

    s = StatisticsSummary()
    assert s.revenue_brutto == 0
    assert s.daily_expense_brutto == 0
    assert s.office_expense_brutto == 0
    assert s.profit_brutto == 0


def test_statistics_summary_rejects_extra_field() -> None:
    """StatisticsSummary must reject unknown fields via StrictModel."""

    with pytest.raises(ValidationError):
        StatisticsSummary(revenue_brutto=1.0, unknown_field="x")


def test_daily_statistics_point_requires_date() -> None:
    """DailyStatisticsPoint requires a date string."""

    p = DailyStatisticsPoint(date="2025-11-01")
    assert p.date == "2025-11-01"
    assert p.revenue_brutto == 0


def test_office_type_breakdown_share() -> None:
    """OfficeTypeBreakdown stores computed share as float."""

    b = OfficeTypeBreakdown(type="Miete", brutto=5000.0, count=2, share=0.45)
    assert b.share == 0.45


def test_office_statistics_row_optional_fields() -> None:
    """OfficeStatisticsRow allows null date and name."""

    r = OfficeStatisticsRow(type="Miete")
    assert r.date is None
    assert r.name is None
    assert r.brutto == 0


def test_monthly_statistics_response_schema_version() -> None:
    """MonthlyStatisticsResponse must carry schema_version == 'v1'."""

    resp = MonthlyStatisticsResponse(
        summary=StatisticsSummary(),
        warnings=[],
    )
    assert resp.schema_version == "v1"
    assert resp.daily_series == []
    assert resp.office_by_type == []
    assert resp.office_rows == []
    assert resp.warnings == []
```

- [ ] **Step 2: Run to confirm failure**

```powershell
uv run pytest tests/test_api_schema_v1.py -k "statistics" -q
```

Expected: `ImportError` or `cannot import name`.

- [ ] **Step 3: Implement models**

Append to `src/bills_analysis/models/api_responses.py`:

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

- [ ] **Step 4: Run and confirm pass**

```powershell
uv run pytest tests/test_api_schema_v1.py -k "statistics" -q
```

Expected: all 7 statistics tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/bills_analysis/models/api_responses.py tests/test_api_schema_v1.py
git commit -m "feat: add statistics response models"
```

---

## Task 2: Implement Excel Statistics Service

**Files:**

- Create: `src/bills_analysis/services/statistics_service.py`
- Create: `tests/test_statistics_service.py`

- [ ] **Step 1: Write failing service tests**

Create `tests/test_statistics_service.py`:

```python
from __future__ import annotations
"""Unit tests for the monthly statistics aggregation service."""

import io
from decimal import Decimal
from pathlib import Path

import pytest
from openpyxl import Workbook


def _write_wb(tmp_path: Path, filename: str, sheets: dict[str, list[list]]) -> Path:
    """Write an openpyxl workbook with one sheet per key and return its path."""
    wb = Workbook()
    first = True
    for sheet_name, rows in sheets.items():
        ws = wb.active if first else wb.create_sheet(sheet_name)
        if first:
            ws.title = sheet_name
            first = False
        for row in rows:
            ws.append(row)
    dest = tmp_path / filename
    wb.save(dest)
    return dest


def _daily_wb(tmp_path: Path, rows: list[list], *, extra_cols: list[str] | None = None) -> Path:
    """Build a minimal Daily workbook with standard + optional extra header columns."""
    extra_cols = extra_cols or []
    header = ["Datum", "Umsatz Brutto", "Ausgabe 1 Brutto", "Ausgabe 2 Brutto"] + extra_cols
    return _write_wb(tmp_path, "daily.xlsx", {"Daily": [header] + rows})


def _office_wb(
    tmp_path: Path,
    rows: list[list],
    *,
    include_datum: bool = False,
    include_name: bool = False,
) -> Path:
    """Build a minimal Office workbook with optional Datum/Rechnung Name columns."""
    header = ["Type", "Brutto"]
    if include_datum:
        header.append("Datum")
    if include_name:
        header.append("Rechnung Name")
    return _write_wb(tmp_path, "office.xlsx", {"Office": [header] + rows})


def test_basic_aggregation(tmp_path: Path) -> None:
    """Service aggregates revenue and expenses correctly from valid workbooks."""
    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(
        tmp_path,
        [
            ["2025-11-01", 1000.0, 50.0, 30.0],
            ["2025-11-02", 2000.0, 0.0, 20.0],
        ],
    )
    office = _office_wb(tmp_path, [["Miete", 4000.0], ["Personal", 1000.0]])

    result = build_monthly_statistics(daily, office)

    assert round(result.summary.revenue_brutto, 2) == 3000.0
    assert round(result.summary.daily_expense_brutto, 2) == 100.0  # 50+30+20
    assert round(result.summary.office_expense_brutto, 2) == 5000.0
    assert round(result.summary.profit_brutto, 2) == 3000.0 - 100.0 - 5000.0
    assert len(result.daily_series) == 2
    assert result.daily_series[0].date == "2025-11-01"
    assert round(result.daily_series[0].revenue_brutto, 2) == 1000.0
    assert round(result.daily_series[0].daily_expense_brutto, 2) == 80.0


def test_ausgabe_sum_brutto_not_double_counted(tmp_path: Path) -> None:
    """Ausgabe sum Brutto column must be ignored by the aggregation."""
    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(
        tmp_path,
        [["2025-11-01", 1000.0, 50.0, 30.0, 80.0]],
        extra_cols=["Ausgabe sum Brutto"],
    )
    office = _office_wb(tmp_path, [["Miete", 1000.0]])

    result = build_monthly_statistics(daily, office)

    assert round(result.summary.daily_expense_brutto, 2) == 80.0  # 50+30, not 80+80


def test_office_by_type_sorted_descending(tmp_path: Path) -> None:
    """office_by_type is sorted by brutto amount descending."""
    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", 100.0, 0.0, 0.0]])
    office = _office_wb(
        tmp_path,
        [["Personal", 1000.0], ["Miete", 5000.0], ["Versicherung", 200.0]],
    )

    result = build_monthly_statistics(daily, office)

    assert result.office_by_type[0].type == "Miete"
    assert result.office_by_type[1].type == "Personal"
    assert result.office_by_type[2].type == "Versicherung"


def test_office_optional_columns_datum_and_name(tmp_path: Path) -> None:
    """Datum and Rechnung Name map to date/name when present; absent → None."""
    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", 100.0, 0.0, 0.0]])
    office = _office_wb(
        tmp_path,
        [["Miete", 4760.0, "2025-12-11", "Landlord GmbH"]],
        include_datum=True,
        include_name=True,
    )

    result = build_monthly_statistics(daily, office)

    row = result.office_rows[0]
    assert row.date == "2025-12-11"
    assert row.name == "Landlord GmbH"
    assert row.type == "Miete"


def test_office_without_optional_columns(tmp_path: Path) -> None:
    """Office rows have date=None and name=None when columns are absent."""
    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", 100.0, 0.0, 0.0]])
    office = _office_wb(tmp_path, [["Miete", 4760.0]])

    result = build_monthly_statistics(daily, office)

    assert result.office_rows[0].date is None
    assert result.office_rows[0].name is None


def test_empty_type_becomes_uncategorized(tmp_path: Path) -> None:
    """Office rows with blank Type are grouped as Uncategorized."""
    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", 100.0, 0.0, 0.0]])
    office = _office_wb(tmp_path, [["", 500.0], [None, 300.0]])

    result = build_monthly_statistics(daily, office)

    types = [r.type for r in result.office_by_type]
    assert "Uncategorized" in types


def test_non_numeric_amount_produces_warning(tmp_path: Path) -> None:
    """Non-numeric amount in Brutto adds a warning and contributes 0."""
    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", "bad", 0.0, 0.0]])
    office = _office_wb(tmp_path, [["Miete", 1000.0]])

    result = build_monthly_statistics(daily, office)

    assert result.summary.revenue_brutto == 0.0
    assert len(result.warnings) >= 1


def test_missing_daily_required_field_raises(tmp_path: Path) -> None:
    """Missing Umsatz Brutto column in Daily workbook raises ValueError."""
    from bills_analysis.services.statistics_service import build_monthly_statistics

    bad_daily = _write_wb(tmp_path, "bad_daily.xlsx", {"Sheet": [["Datum", "SomeOtherCol"], ["2025-11-01", 100]]})
    office = _office_wb(tmp_path, [["Miete", 1000.0]])

    with pytest.raises(ValueError, match="Umsatz Brutto"):
        build_monthly_statistics(bad_daily, office)


def test_missing_office_required_field_raises(tmp_path: Path) -> None:
    """Missing Brutto column in Office workbook raises ValueError."""
    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", 100.0, 0.0, 0.0]])
    bad_office = _write_wb(tmp_path, "bad_office.xlsx", {"Sheet": [["Type", "SomeOtherCol"], ["Miete", 100]]})

    with pytest.raises(ValueError, match="Brutto"):
        build_monthly_statistics(daily, bad_office)
```

- [ ] **Step 2: Run to confirm failure**

```powershell
uv run pytest tests/test_statistics_service.py -q
```

Expected: `ModuleNotFoundError: No module named 'bills_analysis.services.statistics_service'`.

- [ ] **Step 3: Implement service**

Create `src/bills_analysis/services/statistics_service.py`:

```python
from __future__ import annotations
"""Monthly statistics aggregation from Daily/Bar and Office Excel workbooks."""

import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path

from openpyxl import load_workbook

from bills_analysis.models.api_responses import (
    DailyStatisticsPoint,
    MonthlyStatisticsResponse,
    OfficeStatisticsRow,
    OfficeTypeBreakdown,
    StatisticsSummary,
)

_AUSGABE_BRUTTO_RE = re.compile(r"^Ausgabe \d+ Brutto$")
_AUSGABE_NETTO_RE = re.compile(r"^Ausgabe \d+ Netto$")
UNCATEGORIZED = "Uncategorized"


def _headers(ws) -> dict[str, int]:
    """Return a column-name → zero-based index map from the first row."""
    row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), None)
    if row is None:
        return {}
    return {str(cell).strip(): idx for idx, cell in enumerate(row) if cell is not None}


def _require(headers: dict[str, int], names: list[str], label: str) -> None:
    """Raise ValueError listing any required column names not found in headers."""
    missing = [n for n in names if n not in headers]
    if missing:
        raise ValueError(f"{label} workbook is missing required columns: {', '.join(missing)}")


def _to_decimal(value: object, warnings: list[str], label: str) -> Decimal:
    """Convert a cell value to Decimal, recording a warning and returning 0 on failure."""
    if value is None or value == "":
        return Decimal(0)
    try:
        return Decimal(str(value))
    except InvalidOperation:
        warnings.append(f"Non-numeric value in {label}: {value!r} — treated as 0")
        return Decimal(0)


def _date_text(value: object) -> str | None:
    """Convert a cell date value to an ISO string, or return None."""
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def _money(value: Decimal) -> float:
    """Round to 2 decimal places and return as float for JSON output."""
    return float(value.quantize(Decimal("0.01")))


def build_monthly_statistics(daily_xlsx: Path, office_xlsx: Path) -> MonthlyStatisticsResponse:
    """Parse Daily/Bar and Office workbooks and return aggregated monthly statistics."""
    warnings: list[str] = []

    try:
        daily_wb = load_workbook(daily_xlsx, data_only=True)
    except Exception as exc:
        raise ValueError(f"Cannot read Daily workbook: {exc}") from exc

    try:
        office_wb = load_workbook(office_xlsx, data_only=True)
    except Exception as exc:
        raise ValueError(f"Cannot read Office workbook: {exc}") from exc

    daily_series, revenue_total, daily_expense_total = _parse_daily(daily_wb.active, warnings)
    office_rows, office_by_type, office_total = _parse_office(office_wb.active, warnings)

    profit = revenue_total - daily_expense_total - office_total

    return MonthlyStatisticsResponse(
        summary=StatisticsSummary(
            revenue_brutto=_money(revenue_total),
            daily_expense_brutto=_money(daily_expense_total),
            office_expense_brutto=_money(office_total),
            profit_brutto=_money(profit),
        ),
        daily_series=daily_series,
        office_by_type=office_by_type,
        office_rows=office_rows,
        warnings=warnings,
    )


def _parse_daily(
    ws,
    warnings: list[str],
) -> tuple[list[DailyStatisticsPoint], Decimal, Decimal]:
    """Parse the active Daily sheet and return (series, revenue_total, expense_total)."""
    headers = _headers(ws)
    _require(headers, ["Datum", "Umsatz Brutto"], "Daily")

    expense_cols = [name for name in headers if _AUSGABE_BRUTTO_RE.match(name)]

    series: list[DailyStatisticsPoint] = []
    revenue_total = Decimal(0)
    expense_total = Decimal(0)

    for row in ws.iter_rows(min_row=2, values_only=True):
        if all(cell is None for cell in row):
            continue
        date_val = _date_text(row[headers["Datum"]])
        revenue = _to_decimal(row[headers["Umsatz Brutto"]], warnings, "Daily Umsatz Brutto")
        expense = sum(
            _to_decimal(row[headers[col]], warnings, col)
            for col in expense_cols
        )
        revenue_total += revenue
        expense_total += expense
        series.append(
            DailyStatisticsPoint(
                date=date_val or "",
                revenue_brutto=_money(revenue),
                daily_expense_brutto=_money(expense),
                profit_before_office_brutto=_money(revenue - expense),
            )
        )

    return series, revenue_total, expense_total


def _parse_office(
    ws,
    warnings: list[str],
) -> tuple[list[OfficeStatisticsRow], list[OfficeTypeBreakdown], Decimal]:
    """Parse the active Office sheet and return (rows, by_type, total)."""
    headers = _headers(ws)
    _require(headers, ["Type", "Brutto"], "Office")

    has_datum = "Datum" in headers
    has_name = "Rechnung Name" in headers

    rows: list[OfficeStatisticsRow] = []
    type_totals: dict[str, Decimal] = defaultdict(Decimal)
    type_counts: dict[str, int] = defaultdict(int)
    office_total = Decimal(0)

    for row in ws.iter_rows(min_row=2, values_only=True):
        if all(cell is None for cell in row):
            continue

        raw_type = row[headers["Type"]]
        office_type = str(raw_type).strip() if raw_type is not None else ""
        if not office_type:
            office_type = UNCATEGORIZED

        brutto = _to_decimal(row[headers["Brutto"]], warnings, "Office Brutto")

        date_val: str | None = None
        if has_datum:
            date_val = _date_text(row[headers["Datum"]])

        name_val: str | None = None
        if has_name:
            raw_name = row[headers["Rechnung Name"]]
            name_val = str(raw_name).strip() if raw_name is not None else None
            if not name_val:
                name_val = None

        rows.append(
            OfficeStatisticsRow(
                date=date_val,
                type=office_type,
                name=name_val,
                brutto=_money(brutto),
            )
        )
        type_totals[office_type] += brutto
        type_counts[office_type] += 1
        office_total += brutto

    by_type = sorted(
        [
            OfficeTypeBreakdown(
                type=t,
                brutto=_money(v),
                count=type_counts[t],
                share=_money(v / office_total) if office_total else 0.0,
            )
            for t, v in type_totals.items()
        ],
        key=lambda x: x.brutto,
        reverse=True,
    )

    return rows, by_type, office_total
```

- [ ] **Step 4: Run and confirm pass**

```powershell
uv run pytest tests/test_statistics_service.py -q
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add src/bills_analysis/services/statistics_service.py tests/test_statistics_service.py
git commit -m "feat: aggregate monthly statistics from excel"
```

---

## Task 3: Add Monthly Statistics API Endpoint

**Files:**

- Modify: `src/bills_analysis/api/main.py`
- Modify: `tests/test_api_schema_v1.py`
- Modify: `tests/openapi_v1_baseline.json`

- [ ] **Step 1: Write failing API tests**

Append to `tests/test_api_schema_v1.py` after the statistics model tests:

```python
# ---------- Statistics API ----------

import io
from openpyxl import Workbook as _Workbook


def _make_excel_bytes(rows: list[list]) -> bytes:
    """Build a minimal in-memory .xlsx workbook and return its bytes."""
    wb = _Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_statistics_preview_returns_200_with_valid_files() -> None:
    """POST /v1/statistics/monthly-preview with valid files returns 200 and profit_brutto."""

    TestClient, app = _get_test_client_and_app()
    daily_bytes = _make_excel_bytes([
        ["Datum", "Umsatz Brutto", "Ausgabe 1 Brutto"],
        ["2025-11-01", 3000.0, 100.0],
    ])
    office_bytes = _make_excel_bytes([
        ["Type", "Brutto"],
        ["Miete", 1000.0],
    ])
    with TestClient(app) as client:
        resp = client.post(
            "/v1/statistics/monthly-preview",
            files={
                "daily_excel": ("daily.xlsx", daily_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                "office_excel": ("office.xlsx", office_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == "v1"
    assert "profit_brutto" in data["summary"]
    assert round(data["summary"]["revenue_brutto"], 2) == 3000.0


def test_statistics_preview_missing_file_returns_422() -> None:
    """POST /v1/statistics/monthly-preview with only one file returns 422."""

    TestClient, app = _get_test_client_and_app()
    daily_bytes = _make_excel_bytes([["Datum", "Umsatz Brutto"], ["2025-11-01", 1000.0]])
    with TestClient(app) as client:
        resp = client.post(
            "/v1/statistics/monthly-preview",
            files={"daily_excel": ("daily.xlsx", daily_bytes, "application/octet-stream")},
        )
    assert resp.status_code == 422


def test_statistics_preview_invalid_extension_returns_400() -> None:
    """POST /v1/statistics/monthly-preview with .txt file returns 400."""

    TestClient, app = _get_test_client_and_app()
    with TestClient(app) as client:
        resp = client.post(
            "/v1/statistics/monthly-preview",
            files={
                "daily_excel": ("daily.txt", b"not excel", "text/plain"),
                "office_excel": ("office.txt", b"not excel", "text/plain"),
            },
        )
    assert resp.status_code == 400
```

- [ ] **Step 2: Run to confirm failure**

```powershell
uv run pytest tests/test_api_schema_v1.py -k "statistics_preview" -q
```

Expected: `FAILED` with 404 (route not yet registered).

- [ ] **Step 3: Implement endpoint**

In `src/bills_analysis/api/main.py`, add these imports after the existing ones:

```python
import shutil

from bills_analysis.models.api_responses import MonthlyStatisticsResponse
from bills_analysis.services.statistics_service import build_monthly_statistics
```

Add the following route **before** the `_mount_frontend_static_files(app)` call at the bottom of the file:

```python
@app.post("/v1/statistics/monthly-preview", response_model=MonthlyStatisticsResponse)
async def preview_monthly_statistics(
    daily_excel: UploadFile = File(...),
    office_excel: UploadFile = File(...),
) -> MonthlyStatisticsResponse:
    """Accept two monthly Excel files and return aggregated statistics."""
    _validate_excel_upload(daily_excel, field_name="daily_excel")
    _validate_excel_upload(office_excel, field_name="office_excel")

    stats_dir = Path("outputs") / "webapp" / "statistics" / str(uuid4())
    try:
        daily_path = await _save_upload_file(
            daily_excel,
            dest_dir=stats_dir / "daily",
            prefix="daily",
            index=1,
            forced_suffix=None,
        )
        office_path = await _save_upload_file(
            office_excel,
            dest_dir=stats_dir / "office",
            prefix="office",
            index=1,
            forced_suffix=None,
        )
        try:
            return build_monthly_statistics(daily_path, office_path)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Could not process workbook: {exc}") from exc
    finally:
        shutil.rmtree(stats_dir, ignore_errors=True)
```

- [ ] **Step 4: Update OpenAPI baseline**

```powershell
uv run python scripts/export_openapi_v1.py
```

Review the diff — only the new `/v1/statistics/monthly-preview` path and the five new model schemas should appear. Confirm no existing routes changed, then stage the updated baseline.

- [ ] **Step 5: Run and confirm pass**

```powershell
uv run pytest tests/test_api_schema_v1.py tests/test_statistics_service.py -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add src/bills_analysis/api/main.py tests/test_api_schema_v1.py tests/openapi_v1_baseline.json
git commit -m "feat: expose monthly statistics preview api"
```

---

## Task 4: Add Daily Ausgabe Sum Columns

**Files:**

- Modify: `src/bills_analysis/integrations/excel_merge_adapter.py`
- Test: `tests/test_merge_parity.py`

- [ ] **Step 1: Write failing tests**

Append to `tests/test_merge_parity.py`:

```python
# ---------- Ausgabe sum columns ----------

def test_daily_template_includes_ausgabe_sum_columns() -> None:
    """Daily monthly template must include Ausgabe sum Brutto and Ausgabe Sum Netto."""
    from bills_analysis.integrations.excel_merge_adapter import build_daily_monthly_template

    wb = build_daily_monthly_template()
    ws = wb.active
    headers = [cell.value for cell in ws[1]]
    assert "Ausgabe sum Brutto" in headers
    assert "Ausgabe Sum Netto" in headers


def test_merge_daily_writes_ausgabe_sum_values(tmp_path) -> None:
    """merge_daily_excel writes correct sum values into Ausgabe sum columns."""
    from openpyxl import Workbook
    from bills_analysis.integrations.excel_merge_adapter import merge_daily_excel

    # Build a target workbook with the sum columns
    wb = Workbook()
    ws = wb.active
    ws.append([
        "Datum", "Umsatz Brutto",
        "Ausgabe 1 Brutto", "Ausgabe 1 Netto",
        "Ausgabe 2 Brutto", "Ausgabe 2 Netto",
        "Ausgabe sum Brutto", "Ausgabe Sum Netto",
    ])
    target_path = tmp_path / "target.xlsx"
    wb.save(target_path)

    # Merge one row of source data
    source_data = {
        "Datum": "2025-11-01",
        "Umsatz Brutto": 1000.0,
        "Ausgabe 1 Brutto": 30.0,
        "Ausgabe 1 Netto": 25.0,
        "Ausgabe 2 Brutto": 20.0,
        "Ausgabe 2 Netto": 17.0,
    }
    merge_daily_excel(target_path, [source_data])

    from openpyxl import load_workbook
    result_wb = load_workbook(target_path)
    result_ws = result_wb.active
    headers = {cell.value: idx + 1 for idx, cell in enumerate(result_ws[1])}
    data_row = list(result_ws.iter_rows(min_row=2, max_row=2, values_only=True))[0]
    assert data_row[headers["Ausgabe sum Brutto"] - 1] == 50.0
    assert data_row[headers["Ausgabe Sum Netto"] - 1] == 42.0
```

- [ ] **Step 2: Run to confirm failure**

```powershell
uv run pytest tests/test_merge_parity.py -k "ausgabe_sum" -q
```

Expected: `FAILED` or `AttributeError`.

- [ ] **Step 3: Implement**

In `src/bills_analysis/integrations/excel_merge_adapter.py`, locate `_build_daily_template_headers` and append to its header list:

```python
"Ausgabe sum Brutto",
"Ausgabe Sum Netto",
```

Add helper functions:

```python
def _sum_expense_cols(row_values: dict, suffix: str) -> float | None:
    """Sum all Ausgabe <N> <suffix> columns from a row dict; return None if none exist."""
    import re
    pattern = re.compile(rf"^Ausgabe \d+ {re.escape(suffix)}$")
    values = [v for k, v in row_values.items() if pattern.match(k) and isinstance(v, (int, float))]
    return sum(values) if values else None
```

After writing each daily row, check if the target workbook has the sum columns and write the sums:

```python
def _write_ausgabe_sums(ws, target_row: int, header_to_col: dict[str, int], row_values: dict) -> None:
    """Write Ausgabe sum Brutto and Ausgabe Sum Netto to target row if columns exist."""
    brutto_col = header_to_col.get("Ausgabe sum Brutto")
    netto_col = header_to_col.get("Ausgabe Sum Netto")
    if brutto_col is not None:
        val = _sum_expense_cols(row_values, "Brutto")
        if val is not None:
            ws.cell(row=target_row, column=brutto_col, value=val)
    if netto_col is not None:
        val = _sum_expense_cols(row_values, "Netto")
        if val is not None:
            ws.cell(row=target_row, column=netto_col, value=val)
```

Call `_write_ausgabe_sums(ws, current_row, header_to_col, row_values)` after the existing row-writing loop inside `merge_daily_excel`.

- [ ] **Step 4: Run and confirm pass**

```powershell
uv run pytest tests/test_merge_parity.py tests/test_api_schema_v1.py -q
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src/bills_analysis/integrations/excel_merge_adapter.py tests/test_merge_parity.py
git commit -m "feat: add daily expense sum columns"
```

---

## Task 5: Add Frontend Statistics API Client

**Files:**

- Create: `frontend/src/features/statistics/api/statisticsClient.real.js`
- Create: `frontend/src/features/statistics/api/statisticsClient.mock.js`
- Create: `frontend/src/features/statistics/api/statisticsClient.js`
- Create: `frontend/src/features/statistics/api/statisticsClient.real.test.js`

- [ ] **Step 1: Write failing client tests**

Create `frontend/src/features/statistics/api/statisticsClient.real.test.js`:

```js
import { describe, expect, it } from "vitest";
import { previewMonthlyStatisticsReal } from "./statisticsClient.real";

describe("statisticsClient.real", () => {
  it("sends POST to /v1/statistics/monthly-preview", async () => {
    let capturedUrl = "";
    let capturedBody = null;
    const fetchMock = async (url, opts) => {
      capturedUrl = url;
      capturedBody = opts.body;
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            schema_version: "v1",
            summary: { revenue_brutto: 0, daily_expense_brutto: 0, office_expense_brutto: 0, profit_brutto: 0 },
            daily_series: [],
            office_by_type: [],
            office_rows: [],
            warnings: [],
          }),
      };
    };

    const dailyFile = new File(["a"], "daily.xlsx");
    const officeFile = new File(["b"], "office.xlsx");

    await previewMonthlyStatisticsReal(
      { dailyExcel: dailyFile, officeExcel: officeFile },
      { baseUrl: "http://test", fetchImpl: fetchMock },
    );

    expect(capturedUrl).toBe("http://test/v1/statistics/monthly-preview");
    expect(capturedBody).toBeInstanceOf(FormData);
    expect(capturedBody.get("daily_excel")).toBe(dailyFile);
    expect(capturedBody.get("office_excel")).toBe(officeFile);
  });

  it("throws AppHttpError on non-ok response", async () => {
    const fetchMock = async () => ({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "missing field" }),
    });
    const dailyFile = new File(["a"], "daily.xlsx");
    const officeFile = new File(["b"], "office.xlsx");

    await expect(
      previewMonthlyStatisticsReal(
        { dailyExcel: dailyFile, officeExcel: officeFile },
        { baseUrl: "http://test", fetchImpl: fetchMock },
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```powershell
cd frontend
pnpm test -- statisticsClient.real.test.js
```

Expected: `Cannot find module './statisticsClient.real'`.

- [ ] **Step 3: Implement real client**

Create `frontend/src/features/statistics/api/statisticsClient.real.js`:

```js
import { API_BASE_URL } from "../../../config/env";
import { requestJson } from "../../../lib/http";

/**
 * Call /v1/statistics/monthly-preview with two Excel files.
 * @param {{ dailyExcel: File; officeExcel: File }} args
 * @param {{ baseUrl?: string; fetchImpl?: typeof fetch }} [opts]
 */
export async function previewMonthlyStatisticsReal(
  { dailyExcel, officeExcel },
  { baseUrl = API_BASE_URL, fetchImpl } = {},
) {
  const formData = new FormData();
  formData.append("daily_excel", dailyExcel, dailyExcel.name);
  formData.append("office_excel", officeExcel, officeExcel.name);
  return requestJson({
    baseUrl,
    path: "/v1/statistics/monthly-preview",
    method: "POST",
    body: formData,
    fetchImpl,
  });
}
```

- [ ] **Step 4: Implement mock client**

Create `frontend/src/features/statistics/api/statisticsClient.mock.js`:

```js
/**
 * Deterministic mock for statistics preview — returns fixed monthly data.
 * @param {{ dailyExcel: File; officeExcel: File }} _args
 */
export async function previewMonthlyStatisticsMock(_args) {
  await new Promise((r) => setTimeout(r, 80));
  return {
    schema_version: "v1",
    summary: {
      revenue_brutto: 100411.24,
      daily_expense_brutto: 1183.74,
      office_expense_brutto: 111535.95,
      profit_brutto: -12308.45,
    },
    daily_series: [
      { date: "2025-11-01", revenue_brutto: 2437.3, daily_expense_brutto: 0, profit_before_office_brutto: 2437.3 },
      { date: "2025-11-02", revenue_brutto: 3100.0, daily_expense_brutto: 120.0, profit_before_office_brutto: 2980.0 },
    ],
    office_by_type: [
      { type: "Personal", brutto: 60000.0, count: 4, share: 0.538 },
      { type: "Miete", brutto: 28000.0, count: 2, share: 0.251 },
      { type: "Lieferant", brutto: 23535.95, count: 8, share: 0.211 },
    ],
    office_rows: [
      { date: "2025-11-05", type: "Personal", name: "Gehalt Nov", brutto: 15000.0 },
      { date: "2025-11-05", type: "Personal", name: "Gehalt Nov", brutto: 15000.0 },
      { date: "2025-11-10", type: "Miete", name: "Ramen Ippin KL", brutto: 14000.0 },
      { date: "2025-11-12", type: "Lieferant", name: "Noodle Supply GmbH", brutto: 8000.0 },
    ],
    warnings: [],
  };
}
```

- [ ] **Step 5: Implement facade**

Create `frontend/src/features/statistics/api/statisticsClient.js`:

```js
import { API_MODE } from "../../../config/env";
import { previewMonthlyStatisticsMock } from "./statisticsClient.mock";
import { previewMonthlyStatisticsReal } from "./statisticsClient.real";

/**
 * Preview monthly statistics — selects real or mock implementation based on API_MODE.
 * @type {(args: { dailyExcel: File; officeExcel: File }) => Promise<object>}
 */
export const previewMonthlyStatistics =
  API_MODE === "real" ? previewMonthlyStatisticsReal : previewMonthlyStatisticsMock;
```

- [ ] **Step 6: Run and confirm pass**

```powershell
cd frontend
pnpm test -- statisticsClient
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/statistics/api
git commit -m "feat: add statistics api client"
```

---

## Task 6: Build Statistics Page UI

**Files:**

- Create: `frontend/src/features/statistics/pages/StatisticsPage.jsx`
- Create: `frontend/src/features/statistics/components/KpiStrip.jsx`
- Create: `frontend/src/features/statistics/components/ProfitBridgeChart.jsx`
- Create: `frontend/src/features/statistics/components/DailyTrendChart.jsx`
- Create: `frontend/src/features/statistics/components/OfficeTypeBreakdown.jsx`
- Create: `frontend/src/features/statistics/pages/StatisticsPage.test.jsx`
- Modify: `frontend/src/app/routes.jsx`
- Modify: `frontend/src/app/AppFrame.jsx`
- Modify: `frontend/src/i18n/locales/de.json`
- Modify: `frontend/src/i18n/locales/en.json`
- Modify: `frontend/src/i18n/locales/zh.json`

- [ ] **Step 1: Write failing page tests**

Create `frontend/src/features/statistics/pages/StatisticsPage.test.jsx`:

```jsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import i18n from "../../../i18n";
import { StatisticsPage } from "./StatisticsPage";

// Stub the client so tests don't hit real HTTP
vi.mock("../api/statisticsClient", () => ({
  previewMonthlyStatistics: vi.fn().mockResolvedValue({
    schema_version: "v1",
    summary: {
      revenue_brutto: 100000,
      daily_expense_brutto: 1000,
      office_expense_brutto: 50000,
      profit_brutto: 49000,
    },
    daily_series: [],
    office_by_type: [
      { type: "Miete", brutto: 30000, count: 2, share: 0.6 },
      { type: "Personal", brutto: 20000, count: 1, share: 0.4 },
    ],
    office_rows: [
      { date: "2025-11-10", type: "Miete", name: "Ramen KL", brutto: 14000 },
      { date: "2025-11-15", type: "Personal", name: "Gehalt", brutto: 20000 },
    ],
    warnings: ["One cell had a bad value"],
  }),
}));

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <StatisticsPage />
    </I18nextProvider>,
  );
}

describe("StatisticsPage", () => {
  it("renders two file inputs", () => {
    renderPage();
    const inputs = screen.getAllByTestId(/file-input/);
    expect(inputs).toHaveLength(2);
  });

  it("generate button is disabled until both files are selected", () => {
    renderPage();
    const btn = screen.getByTestId("generate-button");
    expect(btn).toBeDisabled();
  });

  it("shows four KPI values after generation", async () => {
    renderPage();
    const daily = new File(["a"], "daily.xlsx");
    const office = new File(["b"], "office.xlsx");
    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [daily] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [office] } });
    fireEvent.click(screen.getByTestId("generate-button"));
    await waitFor(() => expect(screen.getByTestId("kpi-revenue")).toBeInTheDocument());
    expect(screen.getByTestId("kpi-daily-expense")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-office-expense")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-profit")).toBeInTheDocument();
  });

  it("clicking an office type shows its rows", async () => {
    renderPage();
    const daily = new File(["a"], "daily.xlsx");
    const office = new File(["b"], "office.xlsx");
    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [daily] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [office] } });
    fireEvent.click(screen.getByTestId("generate-button"));
    await waitFor(() => screen.getByTestId("kpi-revenue"));
    fireEvent.click(screen.getByText("Miete"));
    expect(screen.getByText("Ramen KL")).toBeInTheDocument();
  });

  it("displays warnings when backend returns them", async () => {
    renderPage();
    const daily = new File(["a"], "daily.xlsx");
    const office = new File(["b"], "office.xlsx");
    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [daily] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [office] } });
    fireEvent.click(screen.getByTestId("generate-button"));
    await waitFor(() => screen.getByText("One cell had a bad value"));
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```powershell
cd frontend
pnpm test -- StatisticsPage
```

Expected: `Cannot find module './StatisticsPage'`.

- [ ] **Step 3: Implement KpiStrip**

Create `frontend/src/features/statistics/components/KpiStrip.jsx`:

```jsx
const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/**
 * Horizontal strip showing four financial KPI tiles.
 * @param {{ summary: { revenue_brutto: number; daily_expense_brutto: number; office_expense_brutto: number; profit_brutto: number } }} props
 */
export function KpiStrip({ summary }) {
  const profitColor = summary.profit_brutto >= 0 ? "var(--color-success, #2db37a)" : "var(--color-danger, #e05260)";
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <KpiTile label="Revenue" value={fmt.format(summary.revenue_brutto)} testId="kpi-revenue" />
      <KpiTile label="Daily Exp" value={fmt.format(summary.daily_expense_brutto)} testId="kpi-daily-expense" />
      <KpiTile label="Office Exp" value={fmt.format(summary.office_expense_brutto)} testId="kpi-office-expense" />
      <KpiTile label="Profit" value={fmt.format(summary.profit_brutto)} testId="kpi-profit" color={profitColor} />
    </div>
  );
}

function KpiTile({ label, value, testId, color }) {
  return (
    <div data-testid={testId} style={{ flex: 1, padding: "12px 16px", border: "1px solid var(--border-color, #e0e0e0)", borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted, #888)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: color || "inherit" }}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Implement ProfitBridgeChart**

Create `frontend/src/features/statistics/components/ProfitBridgeChart.jsx`:

```jsx
const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/**
 * Four-bar SVG chart comparing revenue, expenses, and profit.
 * Bar heights are proportional to absolute value. Expense bars are red, revenue/profit teal or red.
 * @param {{ summary: { revenue_brutto: number; daily_expense_brutto: number; office_expense_brutto: number; profit_brutto: number } }} props
 */
export function ProfitBridgeChart({ summary }) {
  const bars = [
    { label: "Revenue", value: summary.revenue_brutto, positive: true },
    { label: "Daily Exp", value: summary.daily_expense_brutto, positive: false },
    { label: "Office Exp", value: summary.office_expense_brutto, positive: false },
    { label: "Profit", value: summary.profit_brutto, positive: summary.profit_brutto >= 0 },
  ];

  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  const chartH = 140;
  const barW = 56;
  const gap = 20;
  const totalW = bars.length * (barW + gap) + gap;

  return (
    <svg viewBox={`0 0 ${totalW} ${chartH + 40}`} width="100%" style={{ display: "block", maxWidth: 380 }}>
      {bars.map((bar, i) => {
        const barH = Math.max((Math.abs(bar.value) / maxAbs) * chartH, 2);
        const x = gap + i * (barW + gap);
        const y = chartH - barH;
        const fill = bar.positive ? "var(--color-success, #2db37a)" : "var(--color-danger, #e05260)";
        return (
          <g key={bar.label}>
            <rect x={x} y={y} width={barW} height={barH} fill={fill} rx={3} />
            <text x={x + barW / 2} y={chartH + 14} textAnchor="middle" fontSize={10} fill="currentColor">
              {bar.label}
            </text>
            <text x={x + barW / 2} y={Math.max(y - 5, 10)} textAnchor="middle" fontSize={9} fill="currentColor">
              {fmt.format(bar.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 5: Implement DailyTrendChart**

Create `frontend/src/features/statistics/components/DailyTrendChart.jsx`:

```jsx
const fmtDate = (d) => d.slice(5); // MM-DD from YYYY-MM-DD

/**
 * SVG polyline trend chart for daily revenue and expenses.
 * @param {{ series: Array<{ date: string; revenue_brutto: number; daily_expense_brutto: number }> }} props
 */
export function DailyTrendChart({ series }) {
  if (!series.length) return <p style={{ color: "var(--text-muted, #888)" }}>No daily data.</p>;

  const W = 480;
  const H = 140;
  const padX = 30;
  const padY = 10;
  const maxVal = Math.max(...series.flatMap((p) => [p.revenue_brutto, p.daily_expense_brutto]), 1);

  const toX = (i) => padX + (i / (series.length - 1 || 1)) * (W - padX * 2);
  const toY = (v) => padY + (1 - v / maxVal) * (H - padY * 2);

  const pts = (key) => series.map((p, i) => `${toX(i)},${toY(p[key])}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H + 20}`} width="100%" style={{ display: "block" }}>
      <polyline points={pts("revenue_brutto")} fill="none" stroke="var(--color-success, #2db37a)" strokeWidth={2} />
      <polyline points={pts("daily_expense_brutto")} fill="none" stroke="var(--color-danger, #e05260)" strokeWidth={1.5} strokeDasharray="4 3" />
      {series.map((p, i) =>
        i % Math.max(1, Math.floor(series.length / 6)) === 0 ? (
          <text key={p.date} x={toX(i)} y={H + 16} textAnchor="middle" fontSize={9} fill="currentColor">
            {fmtDate(p.date)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
```

- [ ] **Step 6: Implement OfficeTypeBreakdown**

Create `frontend/src/features/statistics/components/OfficeTypeBreakdown.jsx`:

```jsx
import { useState } from "react";

const fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/**
 * Office type breakdown with clickable rows to reveal line-item details.
 * @param {{ byType: Array<{ type: string; brutto: number; count: number; share: number }>; rows: Array<{ date: string|null; type: string; name: string|null; brutto: number }> }} props
 */
export function OfficeTypeBreakdown({ byType, rows }) {
  const [selected, setSelected] = useState(null);

  const detailRows = selected ? rows.filter((r) => r.type === selected) : [];

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-color, #e0e0e0)" }}>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Type</th>
            <th style={{ textAlign: "right", padding: "6px 8px" }}>Brutto</th>
            <th style={{ textAlign: "right", padding: "6px 8px" }}>Count</th>
            <th style={{ textAlign: "right", padding: "6px 8px" }}>Share</th>
          </tr>
        </thead>
        <tbody>
          {byType.map((row) => (
            <tr
              key={row.type}
              onClick={() => setSelected(selected === row.type ? null : row.type)}
              style={{ cursor: "pointer", background: selected === row.type ? "var(--highlight-bg, #f0f7ff)" : "transparent", borderBottom: "1px solid var(--border-color, #f0f0f0)" }}
            >
              <td style={{ padding: "6px 8px" }}>{row.type}</td>
              <td style={{ textAlign: "right", padding: "6px 8px" }}>{fmt.format(row.brutto)}</td>
              <td style={{ textAlign: "right", padding: "6px 8px" }}>{row.count}</td>
              <td style={{ textAlign: "right", padding: "6px 8px" }}>{(row.share * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && detailRows.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginTop: 8, background: "var(--highlight-bg, #f8faff)" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Date</th>
              <th style={{ textAlign: "left", padding: "4px 8px" }}>Name</th>
              <th style={{ textAlign: "right", padding: "4px 8px" }}>Brutto</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((r, i) => (
              <tr key={i} style={{ borderBottom: "1px solid var(--border-color, #eee)" }}>
                <td style={{ padding: "4px 8px" }}>{r.date ?? "—"}</td>
                <td style={{ padding: "4px 8px" }}>{r.name ?? "—"}</td>
                <td style={{ textAlign: "right", padding: "4px 8px" }}>{fmt.format(r.brutto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Implement StatisticsPage**

Create `frontend/src/features/statistics/pages/StatisticsPage.jsx`:

```jsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { previewMonthlyStatistics } from "../api/statisticsClient";
import { KpiStrip } from "../components/KpiStrip";
import { ProfitBridgeChart } from "../components/ProfitBridgeChart";
import { DailyTrendChart } from "../components/DailyTrendChart";
import { OfficeTypeBreakdown } from "../components/OfficeTypeBreakdown";

/**
 * Statistics dashboard page: upload Daily/Office Excel → view monthly KPIs and breakdowns.
 */
export function StatisticsPage() {
  const { t } = useTranslation();
  const [dailyFile, setDailyFile] = useState(null);
  const [officeFile, setOfficeFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const canGenerate = Boolean(dailyFile && officeFile);

  async function handleGenerate() {
    if (!canGenerate) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await previewMonthlyStatistics({ dailyExcel: dailyFile, officeExcel: officeFile });
      setResult(data);
    } catch (err) {
      setError(err.message || t("statistics.errorFallback"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid="statistics-page" style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{t("statistics.title")}</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <label style={{ flex: 1 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{t("statistics.dailyLabel")}</div>
          <input
            data-testid="file-input-daily"
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(e) => setDailyFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label style={{ flex: 1 }}>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{t("statistics.officeLabel")}</div>
          <input
            data-testid="file-input-office"
            type="file"
            accept=".xlsx,.xlsm"
            onChange={(e) => setOfficeFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <button
        data-testid="generate-button"
        onClick={handleGenerate}
        disabled={!canGenerate || loading}
        style={{ marginBottom: 24 }}
      >
        {loading ? t("statistics.generating") : t("statistics.generate")}
      </button>

      {error && <p style={{ color: "var(--color-danger, #e05260)" }}>{error}</p>}

      {result && (
        <>
          <section style={{ marginBottom: 24 }}>
            <KpiStrip summary={result.summary} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("statistics.profitBridge")}</h2>
            <ProfitBridgeChart summary={result.summary} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("statistics.dailyTrend")}</h2>
            <DailyTrendChart series={result.daily_series} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("statistics.officeBreakdown")}</h2>
            <OfficeTypeBreakdown byType={result.office_by_type} rows={result.office_rows} />
          </section>

          {result.warnings.length > 0 && (
            <section>
              <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t("statistics.warnings")}</h2>
              <ul style={{ fontSize: 13, color: "var(--color-warning, #e08c00)" }}>
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Wire routing and navigation**

In `frontend/src/app/routes.jsx`, add the statistics import and route:

```jsx
import { StatisticsPage } from "../features/statistics/pages/StatisticsPage";

// inside <Routes>:
<Route path="/statistics" element={<StatisticsPage />} />
```

In `frontend/src/app/AppFrame.jsx`, add the nav item to the `navItems` array:

```js
{ labelKey: "app.nav.statistics", to: "/statistics" },
```

- [ ] **Step 9: Add i18n keys**

Append to `frontend/src/i18n/locales/en.json`:

```json
"app.nav.statistics": "Statistics",
"statistics.title": "Monthly Statistics",
"statistics.dailyLabel": "Daily / Bar Excel",
"statistics.officeLabel": "Office Excel",
"statistics.generate": "Generate Statistics",
"statistics.generating": "Generating…",
"statistics.errorFallback": "Failed to generate statistics.",
"statistics.profitBridge": "Revenue vs Expenses",
"statistics.dailyTrend": "Daily Trend",
"statistics.officeBreakdown": "Office by Type",
"statistics.warnings": "Warnings"
```

Append the same keys (translated) to `de.json`:

```json
"app.nav.statistics": "Statistik",
"statistics.title": "Monatsstatistik",
"statistics.dailyLabel": "Daily / Bar Excel",
"statistics.officeLabel": "Office Excel",
"statistics.generate": "Statistik generieren",
"statistics.generating": "Generiere…",
"statistics.errorFallback": "Statistik konnte nicht generiert werden.",
"statistics.profitBridge": "Einnahmen vs. Ausgaben",
"statistics.dailyTrend": "Tagesverlauf",
"statistics.officeBreakdown": "Office nach Typ",
"statistics.warnings": "Warnungen"
```

Append to `zh.json`:

```json
"app.nav.statistics": "经营统计",
"statistics.title": "月度统计看板",
"statistics.dailyLabel": "Daily / Bar Excel",
"statistics.officeLabel": "Office Excel",
"statistics.generate": "生成统计",
"statistics.generating": "生成中…",
"statistics.errorFallback": "统计生成失败。",
"statistics.profitBridge": "收入与支出对比",
"statistics.dailyTrend": "每日趋势",
"statistics.officeBreakdown": "Office 支出分类",
"statistics.warnings": "警告"
```

- [ ] **Step 10: Run all frontend tests**

```powershell
cd frontend
pnpm test
```

Expected: all tests pass including StatisticsPage suite.

- [ ] **Step 11: Commit**

```powershell
git add frontend/src/features/statistics frontend/src/app/routes.jsx frontend/src/app/AppFrame.jsx frontend/src/i18n/locales
git commit -m "feat: add statistics dashboard page"
```

---

## Task 7: Add Mock E2E Coverage

**Files:**

- Create: `frontend/e2e/mock/statistics.spec.ts`
- Modify: `frontend/e2e/support/mockApi.ts`

- [ ] **Step 1: Add statistics mock handler**

In `frontend/e2e/support/mockApi.ts`, inside the `page.route("**/v1/**", ...)` handler, add a new case before the fallthrough 404:

```typescript
if (method === "POST" && path === "/v1/statistics/monthly-preview") {
  await fulfillJson(route, 200, {
    schema_version: "v1",
    summary: {
      revenue_brutto: 100411.24,
      daily_expense_brutto: 1183.74,
      office_expense_brutto: 111535.95,
      profit_brutto: -12308.45,
    },
    daily_series: [
      { date: "2025-11-01", revenue_brutto: 2437.3, daily_expense_brutto: 0, profit_before_office_brutto: 2437.3 },
    ],
    office_by_type: [
      { type: "Personal", brutto: 60000.0, count: 4, share: 0.538 },
      { type: "Miete", brutto: 28000.0, count: 2, share: 0.251 },
    ],
    office_rows: [
      { date: "2025-11-05", type: "Personal", name: "Gehalt Nov", brutto: 15000.0 },
      { date: "2025-11-10", type: "Miete", name: "Ramen KL", brutto: 14000.0 },
    ],
    warnings: [],
  });
  return;
}
```

- [ ] **Step 2: Write failing E2E spec**

Create `frontend/e2e/mock/statistics.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { attachMockApi } from "../support/mockApi";

test.describe("Statistics Dashboard (mock)", () => {
  test.beforeEach(async ({ page }) => {
    await attachMockApi(page, { batchType: "daily" });
  });

  test("happy path: upload files, generate, see KPIs", async ({ page }) => {
    await page.goto("/statistics");
    await expect(page.getByTestId("statistics-page")).toBeVisible();

    const dailyBuffer = Buffer.from("placeholder");
    const officeBuffer = Buffer.from("placeholder");

    await page.getByTestId("file-input-daily").setInputFiles({
      name: "daily.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: dailyBuffer,
    });
    await page.getByTestId("file-input-office").setInputFiles({
      name: "office.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: officeBuffer,
    });

    await page.getByTestId("generate-button").click();

    await expect(page.getByTestId("kpi-revenue")).toBeVisible();
    await expect(page.getByTestId("kpi-profit")).toBeVisible();
  });

  test("clicking an office type reveals detail rows", async ({ page }) => {
    await page.goto("/statistics");

    const buf = Buffer.from("placeholder");
    await page.getByTestId("file-input-daily").setInputFiles({ name: "d.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buf });
    await page.getByTestId("file-input-office").setInputFiles({ name: "o.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: buf });
    await page.getByTestId("generate-button").click();

    await expect(page.getByTestId("kpi-revenue")).toBeVisible();
    await page.getByText("Miete").click();
    await expect(page.getByText("Ramen KL")).toBeVisible();
  });
});
```

- [ ] **Step 3: Run mock E2E**

```powershell
cd frontend
pnpm playwright:mock
```

Expected: both statistics tests pass.

- [ ] **Step 4: Commit**

```powershell
git add frontend/e2e/mock/statistics.spec.ts frontend/e2e/support/mockApi.ts
git commit -m "test: cover statistics dashboard e2e"
```

---

## Task 8: Final Verification

**Files:** No new files unless fixing issues found here.

- [ ] **Step 1: Run full backend test suite**

```powershell
uv run pytest tests/test_statistics_service.py tests/test_api_schema_v1.py tests/test_merge_parity.py -q
```

Expected: all pass.

- [ ] **Step 2: Run full frontend test suite**

```powershell
cd frontend
pnpm test
```

Expected: all pass.

- [ ] **Step 3: Build frontend**

```powershell
cd frontend
pnpm build
```

Expected: build succeeds with no type errors.

- [ ] **Step 4: Run all mock E2E tests**

```powershell
cd frontend
pnpm playwright:mock
```

Expected: all pass, including statistics suite.

- [ ] **Step 5: Review changed files**

```powershell
git diff --stat main
```

Expected: only statistics-related files under `src/bills_analysis/`, `tests/`, and `frontend/src/features/statistics/` plus the three modified files (`api/main.py`, `excel_merge_adapter.py`, `AppFrame.jsx`, `routes.jsx`, `openapi_v1_baseline.json`, i18n locales).

- [ ] **Step 6: Commit any fixes**

If step 1–4 required fixes:

```powershell
git add <fixed-files>
git commit -m "fix: stabilize statistics dashboard"
```

---

## Open Decision

Office type `""` / `null` is grouped as `"Uncategorized"` in English. If the product copy should be German (`"Unkategorisiert"`) or left as-is, change `UNCATEGORIZED = "Uncategorized"` in `statistics_service.py` and the matching i18n label before starting Task 2.
