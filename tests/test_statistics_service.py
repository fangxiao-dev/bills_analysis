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


def test_expense_breakdown_combines_bar_ausgabe_and_office_types(tmp_path: Path) -> None:
    """Expense breakdown should treat Bar Ausgabe and each Office type as categories."""

    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(
        tmp_path,
        [
            ["2025-11-01", 1000.0, 50.0, 30.0],
            ["2025-11-02", 1200.0, 0.0, 20.0],
            ["2025-11-02", 800.0, 10.0, 0.0],
        ],
    )
    office = _office_wb(tmp_path, [["Miete", 400.0], ["Miete", 100.0], ["Personal", 300.0]])

    result = build_monthly_statistics(daily, office)

    breakdown = {item.category: item for item in result.expense_breakdown}
    assert round(breakdown["Bar Ausgabe"].brutto, 2) == 110.0
    assert breakdown["Bar Ausgabe"].source == "daily_bar"
    assert breakdown["Bar Ausgabe"].count == 2
    assert round(breakdown["Miete"].brutto, 2) == 500.0
    assert breakdown["Miete"].source == "office"
    assert breakdown["Personal"].source == "office"
    assert round(breakdown["Miete"].share, 4) == round(500.0 / 910.0, 4)


def test_daily_expense_rows_group_dates_and_skip_zero_days(tmp_path: Path) -> None:
    """Daily expense drilldown rows are grouped by date and only include positive expense days."""

    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(
        tmp_path,
        [
            ["2025-11-01", 1000.0, 0.0, 0.0],
            ["2025-11-02", 1200.0, 0.0, 20.0],
            ["2025-11-02", 800.0, 10.0, 0.0],
        ],
    )
    office = _office_wb(tmp_path, [["Miete", 100.0]])

    result = build_monthly_statistics(daily, office)

    assert [(row.date, round(row.brutto, 2)) for row in result.daily_expense_rows] == [("2025-11-02", 30.0)]


def test_daily_expense_rows_include_netto_sum_when_present(tmp_path: Path) -> None:
    """Daily expense drilldown rows include Ausgabe Netto totals when columns exist."""

    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(
        tmp_path,
        [
            ["2025-11-02", 1200.0, 20.0, 10.0, 16.8, 8.4],
            ["2025-11-02", 800.0, 5.0, 0.0, 4.2, 0.0],
        ],
        extra_cols=["Ausgabe 1 Netto", "Ausgabe 2 Netto"],
    )
    office = _office_wb(tmp_path, [["Miete", 100.0]])

    result = build_monthly_statistics(daily, office)

    assert len(result.daily_expense_rows) == 1
    assert result.daily_expense_rows[0].brutto == 35.0
    assert result.daily_expense_rows[0].netto == 29.4


def test_daily_expense_rows_accept_lowercase_netto_headers(tmp_path: Path) -> None:
    """Daily expense netto columns may use lowercase netto in production workbooks."""

    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(
        tmp_path,
        [["2025-11-02", 1200.0, 20.0, 10.0, 16.8, 8.4]],
        extra_cols=["Ausgabe 1 netto", "Ausgabe 2 netto"],
    )
    office = _office_wb(tmp_path, [["Miete", 100.0]])

    result = build_monthly_statistics(daily, office)

    assert result.daily_expense_rows[0].brutto == 30.0
    assert result.daily_expense_rows[0].netto == 25.2


def test_daily_expense_rows_warn_when_item_netto_columns_absent(tmp_path: Path) -> None:
    """Daily expense drilldown does not use Ausgabe Sum Netto as a source."""

    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(
        tmp_path,
        [["2025-11-02", 1200.0, 20.0, 10.0, 25.2]],
        extra_cols=["Ausgabe Sum Netto"],
    )
    office = _office_wb(tmp_path, [["Miete", 100.0]])

    result = build_monthly_statistics(daily, office)

    assert result.daily_expense_rows[0].brutto == 30.0
    assert result.daily_expense_rows[0].netto is None
    assert "no Ausgabe N Netto columns" in result.warnings[0]


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


def test_office_rows_include_netto_when_column_present(tmp_path: Path) -> None:
    """Office drilldown rows include Netto when the Office workbook has that column."""

    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", 100.0, 0.0, 0.0]])
    office = _write_wb(
        tmp_path,
        "office.xlsx",
        {"Office": [["Type", "Brutto", "Netto", "Datum", "Rechnung Name"], ["Reinigung", 2201.5, 1849.16, "2025-11-11", "KARAKOC"]]},
    )

    result = build_monthly_statistics(daily, office)

    row = result.office_rows[0]
    assert row.brutto == 2201.5
    assert row.netto == 1849.16


def test_manual_expense_rows_are_aggregated_with_office_types(tmp_path: Path) -> None:
    """Manual Ausgabe rows contribute to office totals, details, and breakdowns."""

    from bills_analysis.services.statistics_service import build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", 1000.0, 0.0, 0.0]])
    office = _office_wb(tmp_path, [["Miete", 400.0]])

    result = build_monthly_statistics(
        daily,
        office,
        manual_expense_rows=[
            {"type": "Personalkosten", "brutto": "1200,50", "netto": "1008.82"},
            {"type": "代付款", "brutto": 300, "netto": 300},
        ],
        allow_duplicate_manual_types=True,
    )

    by_type = {row.type: row for row in result.office_by_type}
    breakdown = {row.category: row for row in result.expense_breakdown}
    details = {row.type: row for row in result.office_rows}
    assert result.summary.office_expense_brutto == 1900.5
    assert by_type["Personalkosten"].brutto == 1200.5
    assert by_type["代付款"].brutto == 300.0
    assert breakdown["Personalkosten"].source == "office"
    assert details["Personalkosten"].netto == 1008.82


def test_manual_expense_duplicate_office_type_requires_confirmation(tmp_path: Path) -> None:
    """Manual types matching Office Type case-insensitively require confirmation."""

    from bills_analysis.services.statistics_service import DuplicateManualExpenseTypesError, build_monthly_statistics

    daily = _daily_wb(tmp_path, [["2025-11-01", 1000.0, 0.0, 0.0]])
    office = _office_wb(tmp_path, [["Personalkosten", 400.0]])

    with pytest.raises(DuplicateManualExpenseTypesError) as exc_info:
        build_monthly_statistics(
            daily,
            office,
            manual_expense_rows=[{"type": "personalkosten", "brutto": 1200.0, "netto": 1008.0}],
            allow_duplicate_manual_types=False,
        )

    assert exc_info.value.duplicate_types == ["personalkosten"]


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
