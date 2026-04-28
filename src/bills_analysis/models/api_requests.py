from __future__ import annotations

from typing import Any, Annotated, Literal

from pydantic import AliasChoices, Field

from bills_analysis.models.common import InputFile, StrictModel
from bills_analysis.models.enums import BatchType


class CreateBatchRequest(StrictModel):
    """Request payload for creating a new processing batch."""

    # Main field name is `type`; accept `batch_type` for backward compatibility.
    type: BatchType = Field(validation_alias=AliasChoices("type", "batch_type"))
    run_date: Annotated[str | None, Field(pattern=r"^\d{2}/\d{2}/\d{4}$")] = None
    inputs: Annotated[list[InputFile], Field(min_length=1)]
    metadata: dict[str, Any] = Field(default_factory=dict)


class CreateBatchUploadForm(StrictModel):
    """Parsed multipart form fields for creating a batch upload task."""

    type: BatchType
    run_date: Annotated[str | None, Field(pattern=r"^\d{2}/\d{2}/\d{4}$")] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SubmitReviewRequest(StrictModel):
    """Human-reviewed rows submitted back to backend."""

    rows: Annotated[list[dict[str, Any]], Field(min_length=1)]


class CreateManualExpenseTypeRequest(StrictModel):
    """Request payload for appending one statistics manual Ausgabe type."""

    type: Annotated[str, Field(min_length=1)]


class MergeRequest(StrictModel):
    """Request payload to trigger merge into target dataset."""

    mode: Literal["overwrite", "append"] = "overwrite"
    monthly_excel_path: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
