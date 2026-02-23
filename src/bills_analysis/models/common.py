from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    """Base model that rejects unknown fields to keep schema strict."""

    model_config = ConfigDict(extra="forbid")


class InputFile(StrictModel):
    """Single input file descriptor from API requests."""

    path: str = Field(min_length=1)
    category: Literal["bar", "zbon", "office"] | None = None
    status: Literal["queued", "processing", "extracted", "failed", "skipped"] | None = None
    error: str | None = None


class ErrorInfo(StrictModel):
    """Normalized API error payload for batch-level failures."""

    code: str
    message: str
    details: dict[str, Any] | None = None
