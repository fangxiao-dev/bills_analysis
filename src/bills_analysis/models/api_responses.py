from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from bills_analysis.models.common import ErrorInfo, InputFile, StrictModel
from bills_analysis.models.enums import BatchStatus, BatchType, TaskType
from bills_analysis.models.internal import BatchRecord, QueueTask
from bills_analysis.models.version import SCHEMA_VERSION


class BatchResponse(StrictModel):
    """Public batch response contract returned by API endpoints."""

    schema_version: Literal["v1"] = SCHEMA_VERSION
    batch_id: str
    type: BatchType
    status: BatchStatus
    run_date: str | None = None
    inputs: list[InputFile] = Field(default_factory=list)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    review_rows_count: int = 0
    merge_output: dict[str, Any] = Field(default_factory=dict)
    error: ErrorInfo | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_record(cls, record: BatchRecord) -> "BatchResponse":
        """Map internal storage model to stable public response shape."""

        error_obj = None
        if record.error:
            error_obj = ErrorInfo(code="BATCH_ERROR", message=record.error)
        merge_output = dict(record.merge_output or {})
        if merge_output:
            download_path = f"/v1/batches/{record.batch_id}/merge-output/download"
            abs_candidate = (
                merge_output.get("merged_excel_abs_path")
                or merge_output.get("output_abs_path")
                or merge_output.get("merged_excel_path")
                or merge_output.get("output_path")
            )
            if isinstance(abs_candidate, str) and abs_candidate.strip():
                merge_output.setdefault("merged_excel_abs_path", abs_candidate)
                merge_output.setdefault("output_abs_path", abs_candidate)
                merge_output["merged_excel_path"] = download_path
                merge_output["output_path"] = download_path
        return cls(
            batch_id=record.batch_id,
            type=record.batch_type,
            status=record.status,
            run_date=record.run_date,
            inputs=record.inputs,
            artifacts=record.artifacts,
            review_rows_count=len(record.review_rows),
            merge_output=merge_output,
            error=error_obj,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )


class BatchListResponse(StrictModel):
    """Paginated/list response wrapper for batch query endpoint."""

    schema_version: Literal["v1"] = SCHEMA_VERSION
    total: int
    items: list[BatchResponse]


class MergeTaskResponse(StrictModel):
    """Public merge-task response for async merge trigger endpoint."""

    schema_version: Literal["v1"] = SCHEMA_VERSION
    task_id: str
    batch_id: str
    task_type: TaskType
    created_at: datetime

    @classmethod
    def from_task(cls, task: QueueTask) -> "MergeTaskResponse":
        """Map internal task object to public task response."""

        return cls(
            task_id=task.task_id,
            batch_id=task.batch_id,
            task_type=task.task_type,
            created_at=task.created_at,
        )


class CreateBatchUploadTaskResponse(StrictModel):
    """Response returned after multipart upload batch is accepted."""

    schema_version: Literal["v1"] = SCHEMA_VERSION
    task_id: str
    batch_id: str
    type: BatchType
    status: BatchStatus
    created_at: datetime

    @classmethod
    def from_batch_and_task(
        cls,
        *,
        batch: BatchRecord,
        task: QueueTask,
    ) -> "CreateBatchUploadTaskResponse":
        """Map created batch/task objects to upload response payload."""

        return cls(
            task_id=task.task_id,
            batch_id=batch.batch_id,
            type=batch.batch_type,
            status=batch.status,
            created_at=task.created_at,
        )


class BatchReviewRow(StrictModel):
    """One review row payload returned for manual review editing UI."""

    row_id: str
    category: str
    filename: str
    result: dict[str, Any] = Field(default_factory=dict)
    score: dict[str, Any] = Field(default_factory=dict)
    preview_url: str | None = None


class BatchReviewRowsResponse(StrictModel):
    """Response envelope for querying review rows of one batch."""

    schema_version: Literal["v1"] = SCHEMA_VERSION
    batch_id: str
    status: BatchStatus
    rows: list[BatchReviewRow] = Field(default_factory=list)


class ReportTypeCorrection(StrictModel):
    """One office type correction captured from model-vs-review comparison."""

    row_id: str
    filename: str
    original_type: str
    corrected_type: str


class ReportErrorResponse(StrictModel):
    """Response envelope returned after reporting office type errors."""

    schema_version: Literal["v1"] = SCHEMA_VERSION
    status: Literal["reported", "skipped"]
    corrections: list[ReportTypeCorrection] = Field(default_factory=list)


class MergeSourceLocalResponse(StrictModel):
    """Response returned after local monthly Excel source upload."""

    schema_version: Literal["v1"] = SCHEMA_VERSION
    batch_id: str
    source_type: Literal["local_excel"] = "local_excel"
    monthly_excel_path: str
    created_at: datetime
