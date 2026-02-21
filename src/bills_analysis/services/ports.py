from __future__ import annotations

from typing import Any, Awaitable, Callable, Protocol

from bills_analysis.models.internal import BatchRecord, QueueTask


class BatchRepository(Protocol):
    """Persistence contract for batch records."""

    async def create(self, batch: BatchRecord) -> None:
        """Persist a new batch record."""

        ...

    async def get(self, batch_id: str) -> BatchRecord | None:
        """Load one batch by id."""

        ...

    async def save(self, batch: BatchRecord) -> None:
        """Update an existing batch record."""

        ...

    async def list(self, *, limit: int = 100) -> list[BatchRecord]:
        """List latest batch records."""

        ...


class TaskQueue(Protocol):
    """Queue abstraction used by service and worker."""

    async def enqueue(self, task: QueueTask) -> None:
        """Push one task into queue."""

        ...

    async def dequeue(self) -> QueueTask:
        """Pop one task from queue."""

        ...

    def task_done(self) -> None:
        """Mark one consumed task as complete."""

        ...


class ProcessingBackend(Protocol):
    """Backend contract that executes processing and merge work."""

    async def process_batch(
        self,
        batch: BatchRecord,
        *,
        on_file_done: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ) -> dict[str, Any]:
        """Run extraction stage and optionally notify per-file completion."""

        ...

    async def merge_batch(self, batch: BatchRecord, payload: dict) -> dict:
        """Run merge stage for a reviewed batch."""

        ...
