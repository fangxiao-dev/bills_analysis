from __future__ import annotations
"""Unit tests for the monthly statistics aggregation service."""

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
    """Build a minimal Daily workbook with standard and optional extra headers."""

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
    assert round(result.summary.daily_expense_brutto, 2) == 100.0
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

    assert round(result.summary.daily_expense_brutto, 2) == 80.0


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
    """Datum and Rechnung Name map to date/name when present."""

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

    types = [row.type for row in result.office_by_type]
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

    bad_daily = _write_wb(
        tmp_path,
        "bad_daily.xlsx",
        {"Sheet": [["Datum", "SomeOtherCol"], ["2025-11-01", 100]]},
    )
    office = _office_wb(tmp_path, [["Miete", 1000.0]])

    with pytest.raises(ValueError, match="Umsatz Brutto"):
        build_monthly_statistics(bad_daily, office)


def test_missing_office_required_field_raises(tmp_path: Path) -> None:
    """Missing Brutto column in Office workbook raises ValueError."""

    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", 100.0, 0.0, 0.0]])
    bad_office = _write_wb(
        tmp_path,
        "bad_office.xlsx",
        {"Sheet": [["Type", "SomeOtherCol"], ["Miete", 100]]},
    )

    with pytest.raises(ValueError, match="Brutto"):
        build_monthly_statistics(daily, bad_office)
