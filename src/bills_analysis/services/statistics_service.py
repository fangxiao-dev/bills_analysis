from __future__ import annotations
"""Monthly statistics aggregation from Daily/Bar and Office Excel workbooks."""

import re
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from openpyxl import load_workbook
from openpyxl.worksheet.worksheet import Worksheet

from bills_analysis.models.api_responses import (
    DailyStatisticsPoint,
    MonthlyStatisticsResponse,
    OfficeStatisticsRow,
    OfficeTypeBreakdown,
    StatisticsSummary,
)

_AUSGABE_BRUTTO_RE = re.compile(r"^Ausgabe \d+ Brutto$")
UNCATEGORIZED = "Uncategorized"


def _headers(ws: Worksheet) -> dict[str, int]:
    """Return a column-name to zero-based index map from the first row."""

    row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), None)
    if row is None:
        return {}
    return {str(cell).strip(): idx for idx, cell in enumerate(row) if cell is not None}


def _require(headers: dict[str, int], names: list[str], label: str) -> None:
    """Raise ValueError listing any required column names not found in headers."""

    missing = [name for name in names if name not in headers]
    if missing:
        raise ValueError(f"{label} workbook is missing required columns: {', '.join(missing)}")


def _to_decimal(value: Any, warnings: list[str], label: str) -> Decimal:
    """Convert a cell value to Decimal, recording a warning and returning 0 on failure."""

    if value is None or value == "":
        return Decimal("0")
    try:
        return Decimal(str(value).replace(",", "."))
    except InvalidOperation:
        warnings.append(f"Non-numeric value in {label}: {value!r}; treated as 0")
        return Decimal("0")


def _date_text(value: Any) -> str | None:
    """Convert a cell date value to an ISO date string, or return None."""

    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    return text if text else None


def _money(value: Decimal) -> float:
    """Round to 2 decimal places and return as float for JSON output."""

    return float(value.quantize(Decimal("0.01")))


def _share(value: Decimal, total: Decimal) -> float:
    """Return a four-decimal share for type breakdowns."""

    if total == 0:
        return 0.0
    return float((value / total).quantize(Decimal("0.0001")))


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


def _parse_daily(ws: Worksheet, warnings: list[str]) -> tuple[list[DailyStatisticsPoint], Decimal, Decimal]:
    """Parse the active Daily sheet and return series, revenue total, and expense total."""

    headers = _headers(ws)
    _require(headers, ["Datum", "Umsatz Brutto"], "Daily")
    expense_cols = [name for name in headers if _AUSGABE_BRUTTO_RE.match(name)]

    series: list[DailyStatisticsPoint] = []
    revenue_total = Decimal("0")
    expense_total = Decimal("0")

    for row in ws.iter_rows(min_row=2, values_only=True):
        if all(cell is None for cell in row):
            continue
        date_val = _date_text(row[headers["Datum"]])
        revenue = _to_decimal(row[headers["Umsatz Brutto"]], warnings, "Daily Umsatz Brutto")
        expense = sum((_to_decimal(row[headers[col]], warnings, col) for col in expense_cols), Decimal("0"))
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
    ws: Worksheet,
    warnings: list[str],
) -> tuple[list[OfficeStatisticsRow], list[OfficeTypeBreakdown], Decimal]:
    """Parse the active Office sheet and return rows, type breakdowns, and total."""

    headers = _headers(ws)
    _require(headers, ["Type", "Brutto"], "Office")

    has_datum = "Datum" in headers
    has_name = "Rechnung Name" in headers
    rows: list[OfficeStatisticsRow] = []
    type_totals: dict[str, Decimal] = defaultdict(lambda: Decimal("0"))
    type_counts: dict[str, int] = defaultdict(int)
    office_total = Decimal("0")

    for row in ws.iter_rows(min_row=2, values_only=True):
        if all(cell is None for cell in row):
            continue

        raw_type = row[headers["Type"]]
        office_type = str(raw_type).strip() if raw_type is not None else ""
        if not office_type:
            office_type = UNCATEGORIZED

        brutto = _to_decimal(row[headers["Brutto"]], warnings, "Office Brutto")
        date_val = _date_text(row[headers["Datum"]]) if has_datum else None
        name_val = None
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
                type=office_type,
                brutto=_money(total),
                count=type_counts[office_type],
                share=_share(total, office_total),
            )
            for office_type, total in type_totals.items()
        ],
        key=lambda breakdown: breakdown.brutto,
        reverse=True,
    )

    return rows, by_type, office_total
