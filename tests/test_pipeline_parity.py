from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from bills_analysis.integrations.azure_pipeline_adapter import (
    AzurePipelineAdapter,
    get_archive_subdir_name,
    get_compressed_pdf_name,
)


def test_archive_subdir_name_parity() -> None:
    """Archive subdir naming should keep legacy date/category conventions."""

    assert get_archive_subdir_name("04/02/2026", "office") == "2602DO Qonto Zahlungsausgang"
    assert get_archive_subdir_name("04/02/2026", "zbon") == "2602DO Z-Bon"
    assert get_archive_subdir_name("04/02/2026", "bar") == "2602DO Bar Ausgabe"


def test_compressed_pdf_name_parity() -> None:
    """Compressed PDF renaming should preserve legacy category-specific format."""

    office_name = get_compressed_pdf_name(
        "office",
        {"sender": "Metro AG", "brutto": "195.56", "tax_id": "DE123"},
        "04/02/2026",
    )
    assert office_name == "2602Do_Metro_195,56_DE123.pdf"

    # tax_id missing → NA placeholder
    office_name_no_taxid = get_compressed_pdf_name(
        "office",
        {"sender": "Metro AG", "brutto": "195.56"},
        "04/02/2026",
    )
    assert office_name_no_taxid == "2602Do_Metro_195,56_NA.pdf"

    # tax_id invalid values → NA placeholder
    for bad in ("", "-", None):
        name = get_compressed_pdf_name(
            "office",
            {"sender": "Metro AG", "brutto": "195.56", "tax_id": bad},
            "04/02/2026",
        )
        assert name == "2602Do_Metro_195,56_NA.pdf", f"expected NA for tax_id={bad!r}"

    zbon_name = get_compressed_pdf_name("zbon", {}, "04/02/2026")
    assert zbon_name == "04_02_2026 do.pdf"

    bar_name = get_compressed_pdf_name(
        "bar",
        {"store_name": "REWE", "brutto": "10,20"},
        "04/02/2026",
    )
    assert bar_name == "REWE 10_20.pdf"


def test_pipeline_adapter_result_append_parity(monkeypatch) -> None:
    """Pipeline adapter should append one JSON entry per processed input file."""

    adapter = AzurePipelineAdapter(max_workers=1)
    test_root = Path("outputs") / "pytest_tmp" / str(uuid4())
    output_root = test_root / "vlm_pipeline"
    backup_root = test_root / "archive"

    def fake_process_one_pdf(**kwargs):
        """Stub per-file processing to isolate result writing behavior."""

        idx = kwargs["idx"]
        return {
            "filename": f"file_{idx}.pdf",
            "result": {"run_date": "04/02/2026"},
            "score": {},
            "category": kwargs["category"],
            "page_count": 1,
            "process_duration": {},
        }

    monkeypatch.setattr(adapter, "_process_one_pdf", fake_process_one_pdf)
    results_path = adapter.run_pipeline(
        ["a.pdf", "b.pdf"],
        output_root=output_root,
        backup_dest_dir=backup_root,
        category="BAR",
        run_date="04/02/2026",
    )

    data = json.loads(results_path.read_text(encoding="utf-8"))
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["filename"] == "file_1.pdf"
    assert data[1]["filename"] == "file_2.pdf"
