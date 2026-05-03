from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path

from bills_analysis.integrations.app_config import resolve_app_config_path
from bills_analysis.services.process_service import ROOT_DIR, run_pipeline as run_pipeline_service


def run_pipeline(
    pdf_paths,
    *,
    output_root: Path,
    backup_dest_dir: Path,
    category: str,
    run_date: str,
    results_dir: Path | None = None,
    results_path: Path | None = None,
    max_pages: int = 4,
    dpi: int = 300,
    purpose: str = "zbon",
) -> None:
    """Compatibility wrapper that delegates pipeline execution to src service."""

    run_pipeline_service(
        pdf_paths,
        output_root=output_root,
        backup_dest_dir=backup_dest_dir,
        category=category,
        run_date=run_date,
        results_dir=results_dir,
        results_path=results_path,
        max_pages=max_pages,
        dpi=dpi,
        purpose=purpose,
    )



def main() -> None:
    """CLI wrapper for running the migrated Azure extraction pipeline service."""

    parser = argparse.ArgumentParser(
        description="Run Azure invoice/receipt extraction with optional PDF backup compression."
    )
    parser.add_argument("inputs", nargs="*", help="PDF file paths")
    parser.add_argument(
        "--input-dir",
        dest="input_dir",
        type=Path,
        help="Directory containing PDFs (added to inputs)",
    )
    parser.add_argument(
        "--dest-dir",
        dest="backup_dest_dir",
        type=Path,
        default=ROOT_DIR / "outputs" / "test_comp_pdf",
        help="Backup/compressed PDF output directory",
    )
    parser.add_argument(
        "--out_dir",
        dest="results_dir",
        type=Path,
        help="Results output directory",
    )
    parser.add_argument(
        "--cat",
        dest="category",
        help="Category name (e.g., BAR, ZBon, OFFICE)",
    )
    parser.add_argument("--office", action="store_true", help="Shortcut for --cat=OFFICE")
    parser.add_argument(
        "--run_date",
        dest="run_date",
        default=datetime.now().strftime("%d/%m/%Y"),
        help="Run date in DD/MM/YYYY",
    )
    args = parser.parse_args()

    inputs = list(args.inputs)
    if args.input_dir is not None:
        if not args.input_dir.exists():
            print(f"目录不存在: {args.input_dir}")
            raise SystemExit(1)
        if not args.input_dir.is_dir():
            print(f"不是目录: {args.input_dir}")
            raise SystemExit(1)
        dir_pdfs = sorted(
            (p for p in args.input_dir.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"),
            key=lambda p: p.name,
        )
        inputs.extend(str(p) for p in dir_pdfs)
    if not inputs:
        print("必须提供至少一个 PDF 路径，或使用 --input-dir")
        raise SystemExit(1)

    thresholds_path = resolve_app_config_path()
    max_pages = 4
    if thresholds_path.exists():
        try:
            max_pages = int(json.loads(thresholds_path.read_text(encoding="utf-8")).get("max_pages", max_pages))
        except Exception:
            pass

    category = args.category
    if args.office:
        category = "OFFICE"
    if not category:
        print("必须指定 --cat=NAME 或使用 --office")
        raise SystemExit(1)

    run_pipeline(
        inputs,
        output_root=ROOT_DIR / "outputs" / "vlm_pipeline",
        backup_dest_dir=args.backup_dest_dir,
        category=category,
        run_date=args.run_date,
        results_dir=args.results_dir,
        max_pages=max_pages,
        dpi=300,
    )


if __name__ == "__main__":
    main()
