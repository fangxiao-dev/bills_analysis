from __future__ import annotations

import asyncio
import time
from pathlib import Path

from bills_analysis.integrations.local_backend import LocalPipelineBackend
from bills_analysis.models.api_requests import CreateBatchRequest
from bills_analysis.models.internal import BatchRecord


def test_local_backend_default_disables_file_timeout(monkeypatch) -> None:
    """Backend should disable per-file timeout when env is unset."""

    monkeypatch.delenv("BACKEND_FILE_TIMEOUT_SEC", raising=False)
    backend = LocalPipelineBackend()
    assert backend.file_timeout_sec is None


def test_local_backend_positive_env_enables_file_timeout(monkeypatch) -> None:
    """Backend should enable per-file timeout when env is a positive number."""

    monkeypatch.setenv("BACKEND_FILE_TIMEOUT_SEC", "12.5")
    backend = LocalPipelineBackend()
    assert backend.file_timeout_sec == 12.5


def test_process_one_file_async_waits_when_timeout_disabled(monkeypatch, tmp_path) -> None:
    """No-timeout mode should wait for worker result instead of returning timeout row."""

    monkeypatch.setenv("BACKEND_FILE_TIMEOUT_SEC", "0")
    backend = LocalPipelineBackend(root=tmp_path / "webapp")
    req = CreateBatchRequest(
        type="office",
        run_date="04/02/2026",
        inputs=[{"path": "a.pdf", "category": "office"}],
        metadata={},
    )
    batch = BatchRecord.new(req)
    item = batch.inputs[0]

    def _slow_success(**_: object) -> dict[str, object]:
        """Simulate a slow extractor that still succeeds."""

        time.sleep(0.05)
        return {
            "row_id": "row-0001",
            "filename": "a.pdf",
            "category": "office",
            "result": {"run_date": "04/02/2026", "brutto": "10.00"},
            "score": {"brutto": 0.99},
        }

    monkeypatch.setattr(backend, "_process_one_file", _slow_success)

    row = asyncio.run(
        backend._process_one_file_async(
            row_id="row-0001",
            batch=batch,
            item=item,
            archive_root=tmp_path / "archive",
            organized_root=tmp_path / "organized",
            max_pages=4,
        )
    )

    assert row["filename"] == "a.pdf"
    assert row.get("extract_error") is None
    assert row["result"]["brutto"] == "10.00"
