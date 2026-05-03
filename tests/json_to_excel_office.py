from __future__ import annotations

import argparse
from pathlib import Path

from bills_analysis.integrations.app_config import resolve_app_config_path
from bills_analysis.services.review_service import export_office_review_excel


def main() -> None:
    """CLI wrapper that exports office review Excel via src review service."""

    parser = argparse.ArgumentParser(description="Map OFFICE results JSON to Excel (one row per entry).")
    parser.add_argument("json_path", type=Path, help="Path to results JSON")
    parser.add_argument(
        "excel_path",
        type=Path,
        nargs="?",
        help="Output Excel path (default: same dir/name as JSON)",
    )
    args = parser.parse_args()

    out_path = export_office_review_excel(
        args.json_path,
        excel_path=args.excel_path,
        config_path=resolve_app_config_path(),
    )
    print(f"[Excel] Written: {out_path}")


if __name__ == "__main__":
    main()
