from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from bills_analysis.integrations.invoice_content_extractor import extract_bill_id

try:
    from dotenv import load_dotenv
except ModuleNotFoundError:
    def load_dotenv(*_args: Any, **_kwargs: Any) -> bool:
        return False

try:
    from azure.ai.documentintelligence import DocumentIntelligenceClient
    from azure.ai.documentintelligence.models import AnalyzeDocumentRequest
    from azure.core.credentials import AzureKeyCredential
except ModuleNotFoundError:
    DocumentIntelligenceClient = None  # type: ignore[assignment]
    AnalyzeDocumentRequest = None  # type: ignore[assignment]
    AzureKeyCredential = None  # type: ignore[assignment]


DEFAULT_DATA_DIR = Path(r"D:\CodeSpace\prj_rechnung\test_data\b")
def _clean_text(value: Any) -> str:
    import re

    return re.sub(r"\s+", " ", str(value or "").strip())


def analyze_pdf(pdf_path: Path, *, model_id: str) -> dict[str, Any]:
    if DocumentIntelligenceClient is None or AzureKeyCredential is None or AnalyzeDocumentRequest is None:
        raise RuntimeError("Missing azure-ai-documentintelligence dependency. Run `uv sync` first.")

    endpoint = os.getenv("AZURE_DI_ENDPOINT") or os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
    key = os.getenv("AZURE_DI_KEY") or os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")
    if not endpoint or not key:
        raise ValueError("Set AZURE_DI_ENDPOINT/AZURE_DI_KEY or AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT/KEY.")

    client = DocumentIntelligenceClient(
        endpoint=endpoint,
        credential=AzureKeyCredential(key),
        api_version="2024-11-30",
    )
    with pdf_path.open("rb") as handle:
        poller = client.begin_analyze_document(model_id, AnalyzeDocumentRequest(bytes_source=handle.read()))
    timeout = float(os.getenv("DI_TIMEOUT_SEC", "120"))
    result = poller.result(timeout=timeout)
    payload = result.as_dict()
    candidate = extract_bill_id(payload)
    return {
        "file": str(pdf_path),
        "model_id": model_id,
        "bill_id": candidate,
        "fields_keys": sorted((payload.get("documents") or [{}])[0].get("fields", {}).keys())
        if payload.get("documents")
        else [],
        "tables_count": len(payload.get("tables") or []),
        "content_preview": _clean_text(payload.get("content"))[:300],
    }


def run_probe(data_dir: Path, *, model_id: str) -> list[dict[str, Any]]:
    pdfs = sorted(data_dir.glob("*.pdf"))
    return [analyze_pdf(pdf_path, model_id=model_id) for pdf_path in pdfs]


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Probe Azure DI content/tables for Rechnung-Nr.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--model-id", default=os.getenv("AZURE_DI_PROBE_MODEL_ID", "prebuilt-invoice"))
    parser.add_argument("--pdf", type=Path, action="append", help="Analyze one PDF path. Can be passed multiple times.")
    args = parser.parse_args()

    pdfs = args.pdf or sorted(args.data_dir.glob("*.pdf"))
    results = [analyze_pdf(pdf_path, model_id=args.model_id) for pdf_path in pdfs]
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
