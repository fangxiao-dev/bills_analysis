from __future__ import annotations

import json
import shutil
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
        normalized_rows = self._normalize_review_rows(
            review.rows,
            run_date=batch.run_date,
            existing_rows=batch.review_rows,
        )
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

    async def report_type_error(self, batch_id: str) -> dict[str, Any]:
        """Snapshot office batch artifacts and return corrected type diffs from human review."""

        batch = await self.repo.get(batch_id)
        if batch is None:
            raise KeyError(batch_id)

        batch_out_dir = self._resolve_batch_output_dir(batch)
        results_path = self._resolve_results_path(batch, batch_out_dir)
        submitted_path = batch_out_dir / "review_rows_submitted.json"
        if not results_path.exists():
            raise ValueError("results.json not found for this batch")
        if not submitted_path.exists():
            raise ValueError("review_rows_submitted.json not found; submit review first")

        results_payload = self._load_json_artifact(results_path, label="results.json")
        submitted_rows = self._load_json_artifact(submitted_path, label="review_rows_submitted.json")
        if not isinstance(results_payload, dict):
            raise ValueError("results.json must be a JSON object")
        if not isinstance(submitted_rows, list):
            raise ValueError("review_rows_submitted.json must be a JSON array")

        corrections = self._compute_type_corrections(results_payload, submitted_rows)
        if not corrections:
            return {
                "status": "skipped",
                "corrections": [],
            }

        dataset_root = Path("dataset") / "type_errors" / batch_id
        dataset_root.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(batch_out_dir, dataset_root, dirs_exist_ok=True)
        summary_path = dataset_root / "correction_summary.json"
        summary_path.write_text(
            json.dumps(
                {
                    "batch_id": batch_id,
                    "generated_at": datetime.now(UTC).isoformat(),
                    "corrections": corrections,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        return {
            "status": "reported",
            "corrections": corrections,
        }

    async def request_merge(self, batch_id: str, req: MergeRequest) -> QueueTask:
        """Mark batch as merging and enqueue merge task."""

        batch = await self.repo.get(batch_id)
        if batch is None:
            raise KeyError(batch_id)
        monthly_excel_path = req.monthly_excel_path or batch.artifacts.get("monthly_excel_path")
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

    def _normalize_review_rows(
        self,
        rows: list[dict[str, Any]],
        *,
        run_date: str | None,
        existing_rows: list[dict[str, Any]] | None = None,
    ) -> list[dict[str, Any]]:
        """Validate and normalize submitted review rows into canonical backend shape."""

        preview_by_row_id, preview_by_filename = self._build_preview_path_lookup(existing_rows or [])
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
            preview_path = row.get("preview_path")
            if preview_path in (None, "", "None"):
                preview_path = preview_by_row_id.get(row_id) or preview_by_filename.get(filename)
            normalized.append(
                {
                    "row_id": row_id,
                    "category": category,
                    "filename": filename,
                    "result": dict(result),
                    "score": dict(score),
                    "preview_path": preview_path,
                }
            )
        return normalized

    def _build_preview_path_lookup(
        self,
        rows: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """Build stable preview-path lookup maps from existing review rows."""

        by_row_id: dict[str, Any] = {}
        by_filename: dict[str, Any] = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            preview_path = row.get("preview_path")
            if preview_path in (None, "", "None"):
                continue
            row_id = str(row.get("row_id") or "").strip()
            filename = str(row.get("filename") or "").strip()
            if row_id:
                by_row_id[row_id] = preview_path
            if filename and filename not in by_filename:
                by_filename[filename] = preview_path
        return by_row_id, by_filename

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

    def _resolve_batch_output_dir(self, batch: BatchRecord) -> Path:
        """Resolve batch output directory from persisted artifact paths with safe fallback."""

        result_json_path = batch.artifacts.get("result_json_path")
        if isinstance(result_json_path, str) and result_json_path.strip():
            return Path(result_json_path).resolve().parent

        review_json_path = batch.artifacts.get("review_json_path")
        if isinstance(review_json_path, str) and review_json_path.strip():
            return Path(review_json_path).resolve().parent

        return (Path("outputs") / "webapp" / batch.batch_id).resolve()

    def _resolve_results_path(self, batch: BatchRecord, batch_out_dir: Path) -> Path:
        """Resolve results.json path with artifact pointer preferred over default location."""

        result_json_path = batch.artifacts.get("result_json_path")
        if isinstance(result_json_path, str) and result_json_path.strip():
            return Path(result_json_path).resolve()
        return batch_out_dir / "results.json"

    def _load_json_artifact(self, path: Path, *, label: str) -> Any:
        """Load one UTF-8 JSON artifact and raise user-facing ValueError on invalid content."""

        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError(f"{label} is not valid JSON") from exc

    def _compute_type_corrections(
        self,
        results_payload: dict[str, Any],
        submitted_rows: list[dict[str, Any]],
    ) -> list[dict[str, str]]:
        """Compute office `type` differences between extraction results and submitted review rows."""

        items = results_payload.get("items", [])
        if not isinstance(items, list):
            raise ValueError("results.json items must be an array")

        original_by_row_id: dict[str, str] = {}
        original_by_filename: dict[str, str] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            if str(item.get("category") or "").strip().lower() != "office":
                continue
            result = item.get("result")
            if not isinstance(result, dict):
                continue
            original_type = result.get("type")
            if not isinstance(original_type, str) or not original_type.strip():
                continue
            normalized_original_type = original_type.strip()
            row_id = str(item.get("row_id") or "").strip()
            filename = str(item.get("filename") or "").strip()
            if row_id:
                original_by_row_id[row_id] = normalized_original_type
            if filename and filename not in original_by_filename:
                original_by_filename[filename] = normalized_original_type

        corrections: list[dict[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for row in submitted_rows:
            if not isinstance(row, dict):
                continue
            if str(row.get("category") or "").strip().lower() != "office":
                continue
            result = row.get("result")
            if not isinstance(result, dict):
                continue
            corrected_type = result.get("type")
            if not isinstance(corrected_type, str) or not corrected_type.strip():
                continue
            normalized_corrected_type = corrected_type.strip()

            row_id = str(row.get("row_id") or "").strip()
            filename = str(row.get("filename") or "").strip()
            original_type = original_by_row_id.get(row_id) or original_by_filename.get(filename)
            if not original_type or normalized_corrected_type == original_type:
                continue

            key = (row_id, filename)
            if key in seen:
                continue
            seen.add(key)
            corrections.append(
                {
                    "row_id": row_id,
                    "filename": filename,
                    "original_type": original_type,
                    "corrected_type": normalized_corrected_type,
                }
            )

        return corrections
