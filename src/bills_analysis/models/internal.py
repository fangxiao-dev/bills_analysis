from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import Field

from bills_analysis.models.api_requests import CreateBatchRequest
from bills_analysis.models.common import InputFile, StrictModel
from bills_analysis.models.enums import BatchStatus, BatchType, TaskType


class BatchRecord(StrictModel):
    """Internal persisted state for one batch workflow."""

    batch_id: str
    batch_type: BatchType
    status: BatchStatus
    run_date: str | None = None
    inputs: list[InputFile] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    review_rows: list[dict[str, Any]] = Field(default_factory=list)
    merge_output: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def new(cls, req: CreateBatchRequest) -> "BatchRecord":
        """Build an initial queued batch record from create request."""

        now = datetime.now(UTC)
        queued_inputs = [item.model_copy(update={"status": "queued", "error": None}) for item in req.inputs]
        return cls(
            batch_id=str(uuid4()),
            batch_type=req.type,
            status=BatchStatus.QUEUED,
            run_date=req.run_date,
            inputs=queued_inputs,
            metadata=req.metadata,
            created_at=now,
            updated_at=now,
        )


class QueueTask(StrictModel):
    """Internal queue message format consumed by worker."""

    task_id: str
    batch_id: str
    task_type: TaskType
    payload: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    @classmethod
    def new(
        cls,
        *,
        batch_id: str,
        task_type: TaskType,
        payload: dict[str, Any] | None = None,
    ) -> "QueueTask":
        """Construct a queue task with generated id and timestamp."""

        return cls(
            task_id=str(uuid4()),
            batch_id=batch_id,
            task_type=task_type,
            payload=payload or {},
            created_at=datetime.now(UTC),
        )
