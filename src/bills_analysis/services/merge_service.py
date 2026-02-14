from __future__ import annotations

from pathlib import Path

from bills_analysis.integrations.excel_merge_adapter import merge_daily_excel, merge_office_excel


def merge_daily(
    validated_xlsx: Path,
    monthly_xlsx: Path,
    *,
    out_dir: Path | None = None,
    append: bool = False,
) -> Path:
    """Merge daily validated workbook into monthly workbook."""

    return merge_daily_excel(validated_xlsx, monthly_xlsx, out_dir=out_dir, append=append)


def merge_office(
    validated_xlsx: Path,
    monthly_xlsx: Path,
    *,
    out_dir: Path | None = None,
    append: bool = False,
) -> Path:
    """Merge office validated workbook into monthly workbook."""

    return merge_office_excel(
        validated_xlsx,
        monthly_xlsx,
        out_dir=out_dir,
        append=append,
    )
