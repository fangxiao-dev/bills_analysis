from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from bills_analysis.models.enums import BatchStatus, TaskType
from bills_analysis.models.internal import BatchRecord
from bills_analysis.services.ports import BatchRepository, ProcessingBackend, TaskQueue


def _set_all_input_status(
    batch: BatchRecord,
    *,
    status: str,
    error: str | None = None,
) -> None:
    """Set one status for all batch input files using immutable model updates."""

    updated_inputs = []
    for item in batch.inputs:
        updated_inputs.append(item.model_copy(update={"status": status, "error": error}))
    batch.inputs = updated_inputs


def _resolve_input_index_from_row_id(row_id: str, size: int) -> int | None:
    """Resolve zero-based input index from canonical `row-XXXX` identifier."""

    text = row_id.strip().lower()
    if not text.startswith("row-"):
        return None
    try:
        position = int(text.split("-", maxsplit=1)[1]) - 1
    except (ValueError, IndexError):
        return None
    if position < 0 or position >= size:
        return None
    return position


def _set_one_input_status(batch: BatchRecord, *, event: dict[str, Any]) -> None:
    """Update one input status/error by row_id first, then filename fallback."""

    status = str(event.get("status") or "").strip()
    if status not in {"processing", "extracted", "failed", "skipped"}:
        return
    error_value = event.get("error")
    error = str(error_value).strip() if isinstance(error_value, str) else None
    if error == "":
        error = None

    idx = _resolve_input_index_from_row_id(str(event.get("row_id") or ""), len(batch.inputs))
    if idx is None:
        filename = str(event.get("filename") or "").strip()
        if filename:
            for input_idx, item in enumerate(batch.inputs):
                if Path(item.path).name == filename:
                    idx = input_idx
                    break
    if idx is None:
        return

    updated_inputs = list(batch.inputs)
    updated_inputs[idx] = updated_inputs[idx].model_copy(update={"status": status, "error": error})
    batch.inputs = updated_inputs


class BatchWorker:
    """Queue worker that executes process/merge tasks."""

    def __init__(
        self,
        *,
        repo: BatchRepository,
        queue: TaskQueue,
        backend: ProcessingBackend,
    ) -> None:
        """Bind repository, queue and backend adapters."""

        self.repo = repo
        self.queue = queue
        self.backend = backend

    async def run_forever(self) -> None:
        """Continuously consume queue tasks."""

        while True:
            await self.run_once()

    async def run_once(self) -> None:
        """Process a single queue task and update batch state."""

        task = await self.queue.dequeue()
        try:
            batch = await self.repo.get(task.batch_id)
            if batch is None:
                return
            if task.task_type == TaskType.PROCESS_BATCH:
                batch.status = BatchStatus.RUNNING
                _set_all_input_status(batch, status="processing", error=None)
                batch.updated_at = datetime.now(UTC)
                await self.repo.save(batch)
                async def _on_file_done(event: dict[str, Any]) -> None:
                    """Persist one completed file status immediately for frontend polling."""

                    _set_one_input_status(batch, event=event)
                    batch.updated_at = datetime.now(UTC)
                    await self.repo.save(batch)

                process_output = await self.backend.process_batch(batch, on_file_done=_on_file_done)
                review_rows = process_output.get("review_rows", [])
                artifacts = process_output.get("artifacts", process_output)
                batch.review_rows = review_rows
                batch.artifacts.update(artifacts)
                # Batch-level FAILED is reserved for system/runtime failures only.
                # File-level extraction failures are represented in `inputs[*].status/error`.
                batch.status = BatchStatus.REVIEW_READY
                batch.error = None
                batch.updated_at = datetime.now(UTC)
                await self.repo.save(batch)
                return
            if task.task_type == TaskType.MERGE_BATCH:
                output = await self.backend.merge_batch(batch, task.payload)
                batch.merge_output = output
                batch.status = BatchStatus.MERGED
                batch.error = None
                batch.updated_at = datetime.now(UTC)
                await self.repo.save(batch)
                return
        except Exception as exc:  # pragma: no cover - defensive runtime safety
            batch = await self.repo.get(task.batch_id)
            if batch is not None:
                batch.status = BatchStatus.FAILED
                batch.error = str(exc)
                if task.task_type == TaskType.PROCESS_BATCH:
                    _set_all_input_status(batch, status="failed", error=str(exc))
                batch.updated_at = datetime.now(UTC)
                await self.repo.save(batch)
        finally:
            self.queue.task_done()


async def run_worker(worker: BatchWorker) -> None:
    """Async entrypoint for external runner integration."""

    await worker.run_forever()


def run_worker_sync(worker: BatchWorker) -> None:
    """Sync entrypoint for local scripts/CLI."""

    asyncio.run(run_worker(worker))
