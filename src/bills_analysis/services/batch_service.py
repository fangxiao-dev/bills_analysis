from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from bills_analysis.models.api_requests import CreateBatchRequest, MergeRequest, SubmitReviewRequest
from bills_analysis.models.enums import BatchStatus, TaskType
from bills_analysis.models.internal import BatchRecord, QueueTask
from bills_analysis.services.ports import BatchRepository, TaskQueue


class BatchService:
    """Application service orchestrating batch lifecycle transitions."""

    def __init__(self, repo: BatchRepository, queue: TaskQueue) -> None:
        """Bind repository and queue implementations."""

        self.repo = repo
        self.queue = queue

    async def create_batch(self, req: CreateBatchRequest) -> BatchRecord:
        """Persist a new batch and enqueue processing task."""

        batch, _ = await self.create_batch_with_task(req)
        return batch

    async def create_batch_with_task(self, req: CreateBatchRequest) -> tuple[BatchRecord, QueueTask]:
        """Persist a batch and return the corresponding queued process task."""

        batch = BatchRecord.new(req)
        task = QueueTask.new(batch_id=batch.batch_id, task_type=TaskType.PROCESS_BATCH)
        await self.repo.create(batch)
        await self.queue.enqueue(task)
        return batch, task

    async def get_batch(self, batch_id: str) -> BatchRecord | None:
        """Load a batch by id."""

        return await self.repo.get(batch_id)

    async def list_batches(self, *, limit: int = 100) -> list[BatchRecord]:
        """List latest batches for API query."""

        return await self.repo.list(limit=limit)

    async def save_review(self, batch_id: str, review: SubmitReviewRequest) -> BatchRecord:
        """Save reviewed rows to an existing batch."""

        batch = await self.repo.get(batch_id)
        if batch is None:
            raise KeyError(batch_id)
        normalized_rows = self._normalize_review_rows(review.rows, run_date=batch.run_date)
        batch.review_rows = normalized_rows
        batch.updated_at = datetime.now(UTC)
        self._persist_review_rows_artifact(batch, normalized_rows)
        await self.repo.save(batch)
        return batch

    async def get_review_rows(self, batch_id: str) -> tuple[BatchRecord, list[dict[str, Any]]]:
        """Fetch current review rows for one batch."""

        batch = await self.repo.get(batch_id)
        if batch is None:
            raise KeyError(batch_id)
        return batch, list(batch.review_rows)

    async def save_merge_source_local(self, batch_id: str, monthly_excel_path: str) -> BatchRecord:
        """Persist uploaded local monthly Excel source path for later merge."""

        batch = await self.repo.get(batch_id)
        if batch is None:
            raise KeyError(batch_id)
        batch.artifacts["monthly_excel_path"] = monthly_excel_path
        batch.updated_at = datetime.now(UTC)
        await self.repo.save(batch)
        return batch

    async def request_merge(self, batch_id: str, req: MergeRequest) -> QueueTask:
        """Mark batch as merging and enqueue merge task."""

        batch = await self.repo.get(batch_id)
        if batch is None:
            raise KeyError(batch_id)
        monthly_excel_path = req.monthly_excel_path or batch.artifacts.get("monthly_excel_path")
        if not monthly_excel_path:
            raise ValueError("monthly_excel_path is required or upload via /merge-source/local first")
        payload = req.model_dump()
        payload["monthly_excel_path"] = monthly_excel_path
        task = QueueTask.new(
            batch_id=batch_id,
            task_type=TaskType.MERGE_BATCH,
            payload=payload,
        )
        batch.status = BatchStatus.MERGING
        batch.updated_at = datetime.now(UTC)
        await self.repo.save(batch)
        await self.queue.enqueue(task)
        return task

    def _normalize_review_rows(self, rows: list[dict[str, Any]], *, run_date: str | None) -> list[dict[str, Any]]:
        """Validate and normalize submitted review rows into canonical backend shape."""

        normalized: list[dict[str, Any]] = []
        for index, row in enumerate(rows, start=1):
            if not isinstance(row, dict):
                raise ValueError("each review row must be an object")

            row_id = str(row.get("row_id") or f"row-{index:04d}")
            category = str(row.get("category") or "").strip().lower()
            filename = str(row.get("filename") or "").strip()
            if category not in {"bar", "zbon", "office"}:
                raise ValueError(f"row[{index}] category must be one of bar/zbon/office")
            if not filename:
                raise ValueError(f"row[{index}] filename is required")

            result = row.get("result")
            if not isinstance(result, dict):
                raise ValueError(
                    f"row[{index}] result must be an object in canonical shape "
                    "{row_id,category,filename,result,score,preview_path}"
                )
            if run_date and result.get("run_date") in (None, "", "None"):
                result["run_date"] = run_date
            meaningful_keys = [
                key
                for key, value in result.items()
                if key != "run_date" and value not in (None, "", "None")
            ]
            if not meaningful_keys:
                raise ValueError(
                    f"row[{index}] result must include non-empty business fields in canonical shape "
                    "{row_id,category,filename,result,score,preview_path}"
                )

            score = row.get("score") if isinstance(row.get("score"), dict) else {}
            normalized.append(
                {
                    "row_id": row_id,
                    "category": category,
                    "filename": filename,
                    "result": dict(result),
                    "score": dict(score),
                    "preview_path": row.get("preview_path"),
                }
            )
        return normalized

    def _persist_review_rows_artifact(self, batch: BatchRecord, rows: list[dict[str, Any]]) -> None:
        """Persist submitted review rows for observability and local debugging."""

        review_json_path = batch.artifacts.get("review_json_path")
        if isinstance(review_json_path, str) and review_json_path.strip():
            target_path = Path(review_json_path)
        else:
            target_path = Path("outputs") / "webapp" / batch.batch_id / "review_rows.json"
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

        submitted_path = target_path.parent / "review_rows_submitted.json"
        submitted_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
