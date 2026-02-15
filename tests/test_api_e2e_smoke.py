from __future__ import annotations

"""Smoke tests for daily/office API chain with mocked external dependencies."""

import io
import json
import os
import time
from pathlib import Path
from typing import Any

import pytest
from openpyxl import Workbook


def _build_test_client():
    """Build a fresh app container and TestClient with inline worker enabled."""

    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    os.environ["RUN_INLINE_WORKER"] = "true"
    import bills_analysis.api.main as api_main
    from bills_analysis.integrations.container import build_container

    api_main.container = build_container()
    return TestClient(api_main.app)


def _wait_for_status(client: Any, batch_id: str, target_status: str, *, timeout_sec: float = 10.0) -> dict[str, Any]:
    """Poll batch endpoint until target status is reached or timeout occurs."""

    deadline = time.time() + timeout_sec
    last_body: dict[str, Any] = {}
    while time.time() < deadline:
        res = client.get(f"/v1/batches/{batch_id}")
        assert res.status_code == 200
        body = res.json()
        last_body = body
        if body["status"] == target_status:
            return body
        if body["status"] == "failed":
            raise AssertionError(f"batch failed unexpectedly: {body}")
        time.sleep(0.05)
    raise AssertionError(f"timeout waiting for status={target_status}, last={last_body}")


def _make_monthly_excel_bytes(*, batch_type: str) -> bytes:
    """Build minimal monthly workbook bytes compatible with daily or office merge."""

    wb = Workbook()
    ws = wb.active
    ws.title = "Monthly"
    if batch_type == "daily":
        ws.append(["Datum", "Umsatz Brutto", "Umsatz Netto", "store_name"])
        ws.append(["04/02/2026", 0, 0, ""])
    else:
        ws.append(
            [
                "Datum",
                "Type",
                "Rechnung Name",
                "Brutto",
                "Netto",
                "Steuernummer",
                "Is Receiver OK",
                "need review",
                "Rechnung Scannen",
            ]
        )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _install_mock_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    """Patch external PDF/Azure calls so smoke tests stay deterministic and local."""

    def fake_compress(pdf_path: Path, *, dest_dir: Path, dpi: int, name_suffix: str) -> Path:
        """Write deterministic archived PDF output for preview and return its path."""

        dest_dir.mkdir(parents=True, exist_ok=True)
        archived = dest_dir / f"{pdf_path.stem}_{name_suffix}.pdf"
        archived.write_bytes(b"%PDF-1.4\narchived\n%%EOF")
        return archived

    def fake_analyze(pdf_path: Path, *, model_id: str, return_fields: bool) -> Any:
        """Return deterministic receipt/invoice payloads for daily and office routes."""

        if model_id == "prebuilt-invoice":
            invoice_payload = {
                "brutto": 120.5,
                "netto": 100.0,
                "invoice_id": "INV-1001",
                "confidence_brutto": 0.95,
                "confidence_netto": 0.92,
                "confidence_invoice_id": 0.9,
            }
            if return_fields:
                return invoice_payload, {"invoice_id": "INV-1001", "sender": "Vendor GmbH"}
            return invoice_payload
        receipt_payload = {
            "store_name": "Demo Store",
            "brutto": 12.34,
            "netto": 10.0,
            "total_tax": 2.34,
            "confidence_store_name": 0.9,
            "confidence_brutto": 0.95,
            "confidence_netto": 0.9,
            "confidence_total_tax": 0.86,
        }
        if return_fields:
            return receipt_payload, {}
        return receipt_payload

    def fake_clean_invoice_fields(fields_payload: dict[str, Any]) -> dict[str, Any]:
        """Pass through office DI fields for mocked semantic extraction."""

        return dict(fields_payload)

    def fake_extract_office_semantics(distilled_fields: dict[str, Any]) -> dict[str, Any]:
        """Return deterministic office semantic fields used by review rows."""

        return {
            "purpose": "office-cost",
            "sender": str(distilled_fields.get("sender") or "Vendor GmbH"),
            "receiver": "Restaurant GmbH",
        }

    monkeypatch.setattr("bills_analysis.integrations.local_backend._compress_pdf_for_archive", fake_compress)
    monkeypatch.setattr("bills_analysis.integrations.local_backend._analyze_pdf_with_azure", fake_analyze)
    monkeypatch.setattr("bills_analysis.integrations.local_backend._clean_invoice_fields", fake_clean_invoice_fields)
    monkeypatch.setattr("bills_analysis.integrations.local_backend._extract_office_semantics", fake_extract_office_semantics)


def _assert_merge_artifacts_exist(client: Any, batch_id: str, batch_body: dict[str, Any]) -> None:
    """Assert merge output and submitted review artifacts are generated and non-empty."""

    merge_output = batch_body["merge_output"]
    merge_summary_path = Path(merge_output["merge_summary_path"])
    validated_excel_path = Path(merge_output["validated_excel_path"])
    merged_excel_abs_path = Path(merge_output["merged_excel_abs_path"])
    output_abs_path = Path(merge_output["output_abs_path"])
    merged_download_path = str(merge_output["merged_excel_path"])
    output_download_path = str(merge_output["output_path"])
    review_json_path = Path(batch_body["artifacts"]["review_json_path"])
    submitted_path = review_json_path.parent / "review_rows_submitted.json"

    assert merge_summary_path.exists()
    assert merge_summary_path.stat().st_size > 0
    summary = json.loads(merge_summary_path.read_text(encoding="utf-8"))
    assert summary["review_rows_count"] >= 1

    assert validated_excel_path.exists()
    assert validated_excel_path.stat().st_size > 0
    assert merged_excel_abs_path.exists()
    assert merged_excel_abs_path.stat().st_size > 0
    assert output_abs_path.exists()
    assert output_abs_path.resolve() == merged_excel_abs_path.resolve()
    assert merged_download_path == f"/v1/batches/{batch_id}/merge-output/download"
    assert output_download_path == f"/v1/batches/{batch_id}/merge-output/download"
    download_res = client.get(merged_download_path)
    assert download_res.status_code == 200
    assert "spreadsheetml" in (download_res.headers.get("content-type") or "")

    assert review_json_path.exists()
    assert review_json_path.stat().st_size > 0
    assert submitted_path.exists()
    assert submitted_path.stat().st_size > 0


def _run_smoke_flow(client: Any, *, batch_type: str) -> None:
    """Run upload-review-merge chain for one batch type and validate outputs."""

    if batch_type == "daily":
        upload_res = client.post(
            "/v1/batches/upload",
            data={"type": "daily", "run_date": "04/02/2026"},
            files=[
                ("zbon_file", ("zbon.pdf", b"%PDF-1.4\nzbon\n%%EOF", "application/pdf")),
                ("bar_files", ("bar.pdf", b"%PDF-1.4\nbar\n%%EOF", "application/pdf")),
            ],
        )
    else:
        upload_res = client.post(
            "/v1/batches/upload",
            data={"type": "office", "run_date": "04/02/2026"},
            files=[("office_files", ("office.pdf", b"%PDF-1.4\noffice\n%%EOF", "application/pdf"))],
        )
    assert upload_res.status_code == 200
    batch_id = upload_res.json()["batch_id"]
    queued_body = client.get(f"/v1/batches/{batch_id}").json()
    assert queued_body["inputs"]
    assert all(item.get("status") in {"queued", "processing"} for item in queued_body["inputs"])

    review_ready_body = _wait_for_status(client, batch_id, "review_ready")
    assert all(item.get("status") == "extracted" for item in review_ready_body["inputs"])
    assert all(item.get("error") in {None, ""} for item in review_ready_body["inputs"])

    rows_res = client.get(f"/v1/batches/{batch_id}/review-rows")
    assert rows_res.status_code == 200
    rows = rows_res.json()["rows"]
    assert rows

    first_preview_url = rows[0].get("preview_url")
    assert first_preview_url
    preview_res = client.get(first_preview_url)
    assert preview_res.status_code == 200
    assert preview_res.headers["content-type"].startswith("application/pdf")

    canonical_rows = []
    for row in rows:
        canonical_rows.append(
            {
                "row_id": row["row_id"],
                "filename": row["filename"],
                "category": row["category"],
                "result": dict(row.get("result") or {}),
                "score": dict(row.get("score") or {}),
            }
        )
    review_res = client.put(f"/v1/batches/{batch_id}/review", json={"rows": canonical_rows})
    assert review_res.status_code == 200

    source_res = client.post(
        f"/v1/batches/{batch_id}/merge-source/local",
        files={
            "file": (
                "monthly.xlsx",
                _make_monthly_excel_bytes(batch_type=batch_type),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert source_res.status_code == 200
    assert Path(source_res.json()["monthly_excel_path"]).exists()

    merge_res = client.post(
        f"/v1/batches/{batch_id}/merge",
        json={"mode": "append" if batch_type == "office" else "overwrite", "metadata": {}},
    )
    assert merge_res.status_code == 200

    merged_body = _wait_for_status(client, batch_id, "merged")
    _assert_merge_artifacts_exist(client, batch_id, merged_body)


def test_api_e2e_smoke_daily_chain(monkeypatch: pytest.MonkeyPatch) -> None:
    """Daily smoke should complete upload-review-merge with deterministic artifacts."""

    _install_mock_pipeline(monkeypatch)
    with _build_test_client() as client:
        _run_smoke_flow(client, batch_type="daily")


def test_api_e2e_smoke_office_chain(monkeypatch: pytest.MonkeyPatch) -> None:
    """Office smoke should complete upload-review-merge with deterministic artifacts."""

    _install_mock_pipeline(monkeypatch)
    with _build_test_client() as client:
        _run_smoke_flow(client, batch_type="office")
