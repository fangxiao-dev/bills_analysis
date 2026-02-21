from __future__ import annotations

import asyncio
from typing import Any

from bills_analysis.integrations.in_memory import InMemoryBatchRepository, InMemoryTaskQueue
from bills_analysis.models.api_requests import CreateBatchRequest
from bills_analysis.models.enums import BatchStatus, TaskType
from bills_analysis.models.internal import BatchRecord, QueueTask
from bills_analysis.workers.worker import BatchWorker


class StubProcessingBackend:
    """Test backend that emits configurable per-file completion events."""

    def __init__(self, *, done_events: list[dict[str, Any]], summary: dict[str, int]) -> None:
        """Store deterministic callback events and final summary payload."""

        self.done_events = done_events
        self.summary = summary

    async def process_batch(self, batch: BatchRecord, *, on_file_done=None) -> dict[str, Any]:
        """Emit per-file callbacks and return synthetic processing output."""

        if on_file_done is not None:
            for event in self.done_events:
                await on_file_done(event)
        return {
            "review_rows": [
                {
                    "row_id": "row-0001",
                    "filename": "a.pdf",
                    "category": "bar",
                    "result": {"run_date": batch.run_date},
                    "score": {},
                }
            ],
            "artifacts": {"review_json_path": "tmp/review_rows.json"},
            "processing_summary": self.summary,
        }

    async def merge_batch(self, batch: BatchRecord, payload: dict[str, Any]) -> dict[str, Any]:
        """Satisfy worker port contract for merge in tests."""

        return {}


def test_worker_sets_review_ready_when_any_file_extracted() -> None:
    """Worker should keep batch review-ready when at least one file is extracted."""

    async def _run() -> None:
        repo = InMemoryBatchRepository()
        queue = InMemoryTaskQueue()
        backend = StubProcessingBackend(
            done_events=[
                {"row_id": "row-0001", "filename": "a.pdf", "status": "failed", "error": "timeout"},
                {"row_id": "row-0002", "filename": "b.pdf", "status": "extracted", "error": None},
            ],
            summary={"total_count": 2, "extracted_count": 1, "failed_count": 1},
        )
        worker = BatchWorker(repo=repo, queue=queue, backend=backend)

        req = CreateBatchRequest(
            type="daily",
            run_date="04/02/2026",
            inputs=[{"path": "a.pdf", "category": "bar"}, {"path": "b.pdf", "category": "zbon"}],
            metadata={},
        )
        batch = BatchRecord.new(req)
        await repo.create(batch)
        await queue.enqueue(QueueTask.new(batch_id=batch.batch_id, task_type=TaskType.PROCESS_BATCH))

        await worker.run_once()
        saved = await repo.get(batch.batch_id)
        assert saved is not None
        assert saved.status == BatchStatus.REVIEW_READY
        assert [item.status for item in saved.inputs] == ["failed", "extracted"]
        assert [item.error for item in saved.inputs] == ["timeout", None]

    asyncio.run(_run())


def test_worker_sets_failed_when_all_files_failed() -> None:
    """Worker should mark batch failed when processing summary has zero extracted rows."""

    async def _run() -> None:
        repo = InMemoryBatchRepository()
        queue = InMemoryTaskQueue()
        backend = StubProcessingBackend(
            done_events=[
                {"row_id": "row-0001", "filename": "a.pdf", "status": "failed", "error": "azure error"},
                {"row_id": "row-0002", "filename": "b.pdf", "status": "failed", "error": "timeout"},
            ],
            summary={"total_count": 2, "extracted_count": 0, "failed_count": 2},
        )
        worker = BatchWorker(repo=repo, queue=queue, backend=backend)

        req = CreateBatchRequest(
            type="daily",
            run_date="04/02/2026",
            inputs=[{"path": "a.pdf", "category": "bar"}, {"path": "b.pdf", "category": "zbon"}],
            metadata={},
        )
        batch = BatchRecord.new(req)
        await repo.create(batch)
        await queue.enqueue(QueueTask.new(batch_id=batch.batch_id, task_type=TaskType.PROCESS_BATCH))

        await worker.run_once()
        saved = await repo.get(batch.batch_id)
        assert saved is not None
        assert saved.status == BatchStatus.FAILED
        assert saved.error == "All files failed during extraction."
        assert [item.status for item in saved.inputs] == ["failed", "failed"]

    asyncio.run(_run())
