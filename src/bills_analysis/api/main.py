from __future__ import annotations

import asyncio
import json
import os
from collections.abc import AsyncIterator
from contextlib import suppress
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import ValidationError

from bills_analysis.integrations.container import AppContainer, build_container
from bills_analysis.models.api_requests import (
    CreateBatchRequest,
    CreateBatchUploadForm,
    MergeRequest,
    SubmitReviewRequest,
)
from bills_analysis.models.api_responses import (
    BatchListResponse,
    BatchReviewRow,
    BatchReviewRowsResponse,
    BatchResponse,
    CreateBatchUploadTaskResponse,
    MergeSourceLocalResponse,
    MergeTaskResponse,
    ReportErrorResponse,
)
from bills_analysis.models.common import InputFile
from bills_analysis.models.enums import BatchType

container: AppContainer = build_container()


async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage startup/shutdown lifecycle and inline worker task."""

    run_inline_worker = os.getenv("RUN_INLINE_WORKER", "true").lower() == "true"
    if run_inline_worker:
        app.state.worker_task = asyncio.create_task(container.worker.run_forever())
    try:
        yield
    finally:
        task = getattr(app.state, "worker_task", None)
        if task is None:
            return
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="bills_analysis webapp skeleton", version="0.1.0", lifespan=lifespan)


def _load_cors_allow_origins() -> list[str]:
    """Resolve CORS allowed origins from env with safe local defaults."""

    raw = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if raw:
        origins = [item.strip() for item in raw.split(",") if item.strip()]
        if origins:
            return origins
    return [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_load_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_metadata_json(raw_metadata: str | None) -> dict[str, Any]:
    """Decode metadata JSON string into dictionary payload."""

    if raw_metadata is None or raw_metadata.strip() == "":
        return {}
    try:
        parsed = json.loads(raw_metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="metadata_json must be valid JSON") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="metadata_json must be a JSON object")
    return parsed


def _validate_pdf_upload(file: UploadFile, *, field_name: str) -> None:
    """Validate filename extension and content type for uploaded PDF."""

    filename = (file.filename or "").strip()
    if not filename or not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail=f"{field_name} must be PDF files")
    if file.content_type and "pdf" not in file.content_type.lower():
        raise HTTPException(status_code=400, detail=f"{field_name} must be PDF files")


def _validate_excel_upload(file: UploadFile, *, field_name: str) -> None:
    """Validate filename extension and content type for uploaded Excel files."""

    filename = (file.filename or "").strip().lower()
    if not filename or not (filename.endswith(".xlsx") or filename.endswith(".xlsm")):
        raise HTTPException(status_code=400, detail=f"{field_name} must be .xlsx or .xlsm file")
    if file.content_type:
        content_type = file.content_type.lower()
        if "spreadsheetml" not in content_type and "excel" not in content_type and content_type != "application/octet-stream":
            raise HTTPException(status_code=400, detail=f"{field_name} must be Excel file")


async def _save_upload_file(
    file: UploadFile,
    *,
    dest_dir: Path,
    prefix: str,
    index: int,
    forced_suffix: str | None = ".pdf",
) -> Path:
    """Persist one UploadFile to disk and return the saved file path."""

    dest_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(file.filename or "").name or f"{prefix}_{index:02d}.pdf"
    stem = Path(safe_name).stem or f"{prefix}_{index:02d}"
    suffix = forced_suffix
    if suffix is None:
        suffix = Path(safe_name).suffix or ""
    dest_path = dest_dir / f"{index:02d}_{stem}{suffix}"
    attempt = 1
    while dest_path.exists():
        dest_path = dest_dir / f"{index:02d}_{stem}_{attempt}{suffix}"
        attempt += 1
    content = await file.read()
    dest_path.write_bytes(content)
    await file.close()
    return dest_path


def _safe_preview_path(batch_id: str, preview_path: str) -> Path:
    """Resolve and validate preview path stays within the batch sandbox root."""

    resolved = Path(preview_path).resolve()
    allowed_root = (Path("outputs") / "webapp" / batch_id).resolve()
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="preview file not found")
    if resolved.suffix.lower() != ".pdf":
        raise HTTPException(status_code=404, detail="preview file not found")
    if not resolved.is_relative_to(allowed_root):
        raise HTTPException(status_code=404, detail="preview file not found")
    return resolved


def _safe_merge_output_path(batch_id: str, merge_output: dict[str, Any]) -> Path:
    """Resolve merge output file path with strict sandbox and extension checks."""

    raw_path = (
        merge_output.get("merged_excel_abs_path")
        or merge_output.get("output_abs_path")
        or merge_output.get("merged_excel_path")
        or merge_output.get("output_path")
    )
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise HTTPException(status_code=404, detail="merge output file not found")
    resolved = Path(raw_path).resolve()
    allowed_root = (Path("outputs") / "webapp" / batch_id).resolve()
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="merge output file not found")
    if resolved.suffix.lower() not in {".xlsx", ".xlsm"}:
        raise HTTPException(status_code=404, detail="merge output file not found")
    if not resolved.is_relative_to(allowed_root):
        raise HTTPException(status_code=404, detail="merge output file not found")
    return resolved


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Lightweight health endpoint for liveness checks."""

    return {"status": "ok"}


@app.post("/v1/batches", response_model=BatchResponse)
async def create_batch(req: CreateBatchRequest) -> BatchResponse:
    """Create a batch and enqueue process task."""

    record = await container.service.create_batch(req)
    return BatchResponse.from_record(record)


@app.post(
    "/v1/batches/upload",
    response_model=CreateBatchUploadTaskResponse,
)
async def create_batch_upload(
    request: Request,
    type: str = Form(...),
    run_date: str | None = Form(None),
    metadata_json: str | None = Form(None),
    zbon_file: UploadFile | None = File(None),
    bar_files: list[UploadFile] = File(default_factory=list),
    office_files: list[UploadFile] = File(default_factory=list),
) -> CreateBatchUploadTaskResponse:
    """Create a batch from multipart upload and enqueue processing task."""

    metadata = _parse_metadata_json(metadata_json)

    try:
        upload_form = CreateBatchUploadForm(type=type, run_date=run_date, metadata=metadata)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=json.loads(exc.json())) from exc

    upload_root = Path("outputs") / "webapp" / "uploads" / str(uuid4())
    inputs: list[InputFile] = []
    form_data = await request.form()
    zbon_part_count = len(form_data.getlist("zbon_file"))

    if upload_form.type == BatchType.DAILY:
        if office_files:
            raise HTTPException(
                status_code=400,
                detail="office_files is not allowed when type=daily",
            )
        if zbon_part_count > 1:
            raise HTTPException(
                status_code=400,
                detail="daily upload requires exactly one zbon_file",
            )
        if zbon_file is None:
            raise HTTPException(
                status_code=400,
                detail="daily upload requires exactly one zbon_file",
            )
        _validate_pdf_upload(zbon_file, field_name="zbon_file")
        zbon_path = await _save_upload_file(
            zbon_file,
            dest_dir=upload_root / "zbon",
            prefix="zbon",
            index=1,
        )
        inputs.append(InputFile(path=str(zbon_path), category="zbon"))

        for index, file in enumerate(bar_files, start=1):
            _validate_pdf_upload(file, field_name="bar_files")
            bar_path = await _save_upload_file(
                file,
                dest_dir=upload_root / "bar",
                prefix="bar",
                index=index,
            )
            inputs.append(InputFile(path=str(bar_path), category="bar"))
    else:
        if not office_files:
            raise HTTPException(
                status_code=400,
                detail="office upload requires at least one office_files item",
            )
        if zbon_part_count > 0 or bar_files:
            raise HTTPException(
                status_code=400,
                detail="zbon_file/bar_files are not allowed when type=office",
            )
        for index, file in enumerate(office_files, start=1):
            _validate_pdf_upload(file, field_name="office_files")
            office_path = await _save_upload_file(
                file,
                dest_dir=upload_root / "office",
                prefix="office",
                index=index,
            )
            inputs.append(InputFile(path=str(office_path), category="office"))

    create_req = CreateBatchRequest(
        type=upload_form.type,
        run_date=upload_form.run_date,
        inputs=inputs,
        metadata=upload_form.metadata,
    )
    batch, task = await container.service.create_batch_with_task(create_req)
    return CreateBatchUploadTaskResponse.from_batch_and_task(batch=batch, task=task)


@app.get("/v1/batches", response_model=BatchListResponse)
async def list_batches(limit: int = 100) -> BatchListResponse:
    """List batches with stable v1 response envelope."""

    records = await container.service.list_batches(limit=limit)
    items = [BatchResponse.from_record(r) for r in records]
    return BatchListResponse(total=len(items), items=items)


@app.get("/v1/batches/{batch_id}", response_model=BatchResponse)
async def get_batch(batch_id: str) -> BatchResponse:
    """Fetch one batch by id."""

    batch = await container.service.get_batch(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="batch not found")
    return BatchResponse.from_record(batch)


@app.get("/v1/batches/{batch_id}/review-rows", response_model=BatchReviewRowsResponse)
async def get_batch_review_rows(batch_id: str, request: Request) -> BatchReviewRowsResponse:
    """Return persisted review rows with API-accessible PDF preview URLs."""

    try:
        batch, rows = await container.service.get_review_rows(batch_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="batch not found") from exc

    base_url = str(request.base_url).rstrip("/")
    items = []
    for idx, row in enumerate(rows, start=1):
        row_id = str(row.get("row_id") or f"row-{idx:04d}")
        preview_url = None
        if row.get("preview_path"):
            preview_url = f"{base_url}/v1/batches/{batch_id}/files/{row_id}/preview"
        items.append(
            BatchReviewRow(
                row_id=row_id,
                category=str(row.get("category") or ""),
                filename=str(row.get("filename") or ""),
                result=dict(row.get("result") or {}),
                score=dict(row.get("score") or {}),
                preview_url=preview_url,
                skip_reason=row.get("skip_reason") or None,
            )
        )
    return BatchReviewRowsResponse(batch_id=batch.batch_id, status=batch.status, rows=items)


@app.get("/v1/batches/{batch_id}/files/{file_key}/preview")
async def get_batch_preview_pdf(batch_id: str, file_key: str) -> FileResponse:
    """Serve one batch preview PDF by stable review row id."""

    try:
        _, rows = await container.service.get_review_rows(batch_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="batch not found") from exc

    selected_row = None
    for idx, row in enumerate(rows, start=1):
        row_id = str(row.get("row_id") or f"row-{idx:04d}")
        if row_id == file_key:
            selected_row = row
            break
    if selected_row is None:
        raise HTTPException(status_code=404, detail="preview file not found")

    preview_raw = selected_row.get("preview_path")
    if not preview_raw:
        raise HTTPException(status_code=404, detail="preview file not found")
    preview_path = _safe_preview_path(batch_id, str(preview_raw))
    return FileResponse(path=preview_path, media_type="application/pdf", filename=preview_path.name)


@app.put("/v1/batches/{batch_id}/review", response_model=BatchResponse)
async def submit_review(batch_id: str, req: SubmitReviewRequest) -> BatchResponse:
    """Store human-reviewed rows for a batch."""

    try:
        record = await container.service.save_review(batch_id, req)
        return BatchResponse.from_record(record)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="batch not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/batches/{batch_id}/merge-source/local", response_model=MergeSourceLocalResponse)
async def upload_local_merge_source(
    batch_id: str,
    file: UploadFile = File(...),
) -> MergeSourceLocalResponse:
    """Upload monthly local Excel source and persist path for merge fallback usage."""

    existing = await container.service.get_batch(batch_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="batch not found")
    _validate_excel_upload(file, field_name="file")
    merge_source_dir = Path("outputs") / "webapp" / batch_id / "merge_source"
    saved_path = await _save_upload_file(
        file,
        dest_dir=merge_source_dir,
        prefix="monthly_source",
        index=1,
        forced_suffix=None,
    )
    batch = await container.service.save_merge_source_local(batch_id, str(saved_path.resolve()))
    return MergeSourceLocalResponse(
        batch_id=batch.batch_id,
        monthly_excel_path=str(saved_path.resolve()),
        created_at=batch.updated_at,
    )


@app.post("/v1/batches/{batch_id}/report-error", response_model=ReportErrorResponse)
async def report_type_error(batch_id: str) -> ReportErrorResponse:
    """Report reviewed office type corrections and snapshot related batch artifacts."""

    try:
        payload = await container.service.report_type_error(batch_id)
        return ReportErrorResponse(**payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="batch not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/v1/batches/{batch_id}/merge", response_model=MergeTaskResponse)
async def queue_merge(batch_id: str, req: MergeRequest) -> MergeTaskResponse:
    """Enqueue merge task for a reviewed batch."""

    try:
        task = await container.service.request_merge(batch_id, req)
        return MergeTaskResponse.from_task(task)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="batch not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/v1/batches/{batch_id}/merge-output/download")
async def download_merge_output(batch_id: str) -> FileResponse:
    """Serve merged Excel output for one batch in local-debug workflow."""

    batch = await container.service.get_batch(batch_id)
    if batch is None:
        raise HTTPException(status_code=404, detail="batch not found")
    merge_output = batch.merge_output if isinstance(batch.merge_output, dict) else {}
    output_path = _safe_merge_output_path(batch_id, merge_output)
    media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return FileResponse(path=output_path, media_type=media, filename=output_path.name)


def _mount_frontend_static_files(application: FastAPI) -> None:
    """Mount Vite build output as SPA static files in Docker environment.

    No-op when FRONTEND_DIST_DIR is not set (local dev with Vite devserver).
    html=True makes unmatched paths fall back to index.html, supporting
    react-router-dom client-side routing (e.g. /upload, /review/<id>).
    Must be called after all @app route registrations to avoid shadowing API routes.
    """
    import logging

    from fastapi.staticfiles import StaticFiles

    dist_dir_raw = os.getenv("FRONTEND_DIST_DIR", "").strip()
    if not dist_dir_raw:
        return
    dist_path = Path(dist_dir_raw)
    if not dist_path.is_dir():
        logging.getLogger(__name__).warning(
            "FRONTEND_DIST_DIR=%s does not exist, skipping static file mount.", dist_dir_raw
        )
        return
    application.mount("/", StaticFiles(directory=str(dist_path), html=True), name="frontend")


_mount_frontend_static_files(app)


def run() -> None:
    """Local API entrypoint used by script/console command."""

    import uvicorn

    # Start local HTTP server with env-configurable host and port.
    uvicorn.run(
        "bills_analysis.api.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=False,
    )


if __name__ == "__main__":
    run()
