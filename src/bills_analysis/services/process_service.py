from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Iterable

from bills_analysis.integrations.azure_pipeline_adapter import AzurePipelineAdapter

ROOT_DIR = Path(__file__).resolve().parents[3]


def collect_pdfs(paths: Iterable[str], input_dir: Path | None) -> list[str]:
    """Collect PDF file paths from explicit arguments plus optional directory."""

    pdfs = list(paths)
    if input_dir is None:
        return pdfs
    if not input_dir.exists():
        raise FileNotFoundError(f"目录不存在: {input_dir}")
    if not input_dir.is_dir():
        raise NotADirectoryError(f"不是目录: {input_dir}")
    dir_pdfs = sorted(
        (p for p in input_dir.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"),
        key=lambda p: p.name,
    )
    pdfs.extend(str(p) for p in dir_pdfs)
    return pdfs


def run_pipeline(
    pdf_paths: Iterable[str],
    *,
    output_root: Path,
    backup_dest_dir: Path,
    category: str,
    run_date: str,
    batch_metadata: dict | None = None,
    results_dir: Path | None = None,
    results_path: Path | None = None,
    max_pages: int = 4,
    dpi: int = 300,
    purpose: str = "zbon",
) -> Path:
    """Run category-specific extraction pipeline and return the result JSON path."""

    adapter = AzurePipelineAdapter()
    return adapter.run_pipeline(
        pdf_paths,
        output_root=output_root,
        backup_dest_dir=backup_dest_dir,
        category=category,
        run_date=run_date,
        batch_metadata=batch_metadata,
        results_dir=results_dir,
        results_path=results_path,
        max_pages=max_pages,
        dpi=dpi,
        purpose=purpose,
    )


def run_pipeline_by_category(
    *,
    bar_pdfs: list[str],
    zbon_pdfs: list[str],
    office_pdfs: list[str],
    backup_dest_dir: Path,
    run_date: str,
    results_dir: Path | None,
) -> Path:
    """Run BAR/ZBon or OFFICE modes and write a single merged results JSON file."""

    if not bar_pdfs and not zbon_pdfs and not office_pdfs:
        raise ValueError("必须提供 BAR/ZBon 或 OFFICE 的 PDF（或目录）。")
    if office_pdfs and (bar_pdfs or zbon_pdfs):
        raise ValueError("OFFICE 与 BAR/ZBon 互斥，请单独运行。")

    output_root = ROOT_DIR / "outputs" / "vlm_pipeline"
    timestamp = int(datetime.now().timestamp())
    final_results_dir = results_dir or output_root
    results_path = final_results_dir / f"results_{timestamp}.json"

    if office_pdfs:
        run_pipeline(
            office_pdfs,
            output_root=output_root,
            backup_dest_dir=backup_dest_dir,
            category="OFFICE",
            run_date=run_date,
            results_dir=final_results_dir,
            results_path=results_path,
            dpi=300,
        )
    else:
        run_pipeline(
            bar_pdfs,
            output_root=output_root,
            backup_dest_dir=backup_dest_dir,
            category="BAR",
            run_date=run_date,
            results_dir=final_results_dir,
            results_path=results_path,
            dpi=300,
        )
        run_pipeline(
            zbon_pdfs,
            output_root=output_root,
            backup_dest_dir=backup_dest_dir,
            category="ZBon",
            run_date=run_date,
            results_dir=final_results_dir,
            results_path=results_path,
            dpi=300,
        )
    return results_path
