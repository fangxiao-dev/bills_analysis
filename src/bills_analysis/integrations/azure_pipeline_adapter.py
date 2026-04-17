from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import fitz  # PyMuPDF

from bills_analysis.integrations.office_semantics import match_receiver_address, resolve_receiver_ok
from bills_analysis.integrations.office_receiver_mapping import resolve_expected_receiver_from_metadata
from bills_analysis.vlm import prompts_dict

THRESHOLD_RECEIPT_RATIO = 2.0


def get_pdf_page_ratio(doc: fitz.Document) -> float | None:
    """Return first-page height/width ratio for PDF orientation heuristics."""

    if doc.page_count < 1:
        return None
    page = doc.load_page(0)
    rect = page.rect
    width = rect.width
    height = rect.height
    if page.rotation in (90, 270):
        width, height = height, width
    if width <= 0:
        return None
    return height / width


def get_archive_subdir_name(run_date: str, category: str) -> str:
    """Build archive folder naming convention used by legacy scripts."""

    try:
        dt = datetime.strptime(run_date, "%d/%m/%Y")
        yymm = f"{dt.year % 100:02d}{dt.month:02d}"
    except ValueError:
        yymm = "0000"
    cat = category.strip().lower()
    if cat == "office":
        return f"{yymm}DO Qonto Zahlungsausgang"
    if cat == "zbon":
        return f"{yymm}DO Bar Ausgabe"
    if cat == "bar":
        return f"{yymm}DO Z-Bon"
    return f"{yymm}DO {category}"


def get_compressed_pdf_name(category: str, extracted_kv: dict[str, Any], run_date: str) -> str | None:
    """Build archive PDF filename based on extracted fields and category rules."""

    cat = category.strip().lower()
    if cat == "office":
        try:
            dt = datetime.strptime(run_date, "%d/%m/%Y")
            yymm = f"{dt.year % 100:02d}{dt.month:02d}"
        except ValueError:
            return None
        sender = extracted_kv.get("sender") or ""
        sender_first = str(sender).strip().split(" ")[0] if sender else ""
        brutto = extracted_kv.get("brutto") or ""
        brutto_norm = str(brutto).strip().replace(".", ",")
        if sender_first and brutto_norm:
            return f"{yymm}Do_{sender_first}_{brutto_norm}.pdf"
        return None
    if cat == "zbon":
        try:
            dt = datetime.strptime(run_date, "%d/%m/%Y")
            return f"{dt.day:02d}_{dt.month:02d}_{dt.year} do.pdf"
        except ValueError:
            return None
    if cat == "bar":
        store_name = extracted_kv.get("store_name") or ""
        brutto = extracted_kv.get("brutto") or ""
        brutto_norm = str(brutto).strip().replace(",", ".")
        int_part, frac_part = brutto_norm, "00"
        if "." in brutto_norm:
            int_part, frac_part = brutto_norm.split(".", 1)
        int_part = "".join(ch for ch in int_part if ch.isdigit()) or "0"
        frac_part = "".join(ch for ch in frac_part if ch.isdigit()) or "00"
        safe_store = store_name.strip().replace("/", " ").replace("\\", " ").strip()
        if safe_store:
            return f"{safe_store} {int_part}_{frac_part}.pdf"
        return None
    return None


def calc_proc_time(start: float) -> tuple[float, float]:
    """Return current timestamp and elapsed seconds from start marker."""

    time_now = time.perf_counter()
    return time_now, time_now - start


class AzurePipelineAdapter:
    """Adapter that preserves legacy test pipeline behavior in src architecture."""

    def __init__(self, *, max_workers: int = 4) -> None:
        """Initialize adapter with configurable worker parallelism."""

        self.max_workers = max_workers

    def run_pipeline(
        self,
        pdf_paths: Iterable[str],
        *,
        output_root: Path,
        backup_dest_dir: Path,
        category: str,
        run_date: str,
        batch_metadata: dict[str, Any] | None = None,
        results_dir: Path | None = None,
        results_path: Path | None = None,
        max_pages: int = 4,
        dpi: int = 300,
        purpose: str = "zbon",
    ) -> Path:
        """Execute the full extraction pipeline and append JSON results incrementally."""

        timestamp = int(datetime.now().timestamp())
        if results_dir is None:
            results_dir = output_root
        if results_dir.exists() and results_dir.is_file():
            raise ValueError(f"--out_dir 不能是文件: {results_dir}")
        results_dir.mkdir(parents=True, exist_ok=True)
        if results_path is None:
            results_path = results_dir / f"results_{timestamp}.json"

        def _write_results(entry: dict[str, Any]) -> None:
            """Append one result entry into the output JSON list file."""

            results_path.parent.mkdir(parents=True, exist_ok=True)
            if not results_path.exists():
                with results_path.open("w", encoding="utf-8") as f:
                    json.dump([], f, ensure_ascii=False, indent=2)
            raw = results_path.read_text(encoding="utf-8").strip()
            if raw:
                data = json.loads(raw)
                if not isinstance(data, list):
                    raise ValueError("Results file is not a JSON list.")
            else:
                data = []
            data.append(entry)
            with results_path.open("w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        pdf_list = list(pdf_paths)
        total = len(pdf_list)
        if total == 0:
            return results_path

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = [
                executor.submit(
                    self._process_one_pdf,
                    idx=idx,
                    total=total,
                    pdf=pdf,
                    output_root=output_root,
                    backup_dest_dir=backup_dest_dir,
                    category=category,
                    run_date=run_date,
                    batch_metadata=batch_metadata,
                    max_pages=max_pages,
                    dpi=dpi,
                    purpose=purpose,
                )
                for idx, pdf in enumerate(pdf_list, start=1)
            ]
            for future in as_completed(futures):
                entry = future.result()
                if entry is None:
                    continue
                _write_results(entry)

        return results_path

    def _process_one_pdf(
        self,
        *,
        idx: int,
        total: int,
        pdf: str,
        output_root: Path,
        backup_dest_dir: Path,
        category: str,
        run_date: str,
        max_pages: int,
        dpi: int,
        purpose: str,
        batch_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Process one PDF file with extraction, scoring and archive generation."""

        pdf_path = Path(pdf)
        if not pdf_path.exists():
            return None
        is_office = category.strip().lower() == "office"
        file_type = "invoice"
        pdf_read_failed = False
        try:
            with fitz.open(pdf_path) as doc:
                pdf_page_count = doc.page_count
                pdf_ratio = get_pdf_page_ratio(doc)
        except Exception:
            pdf_page_count = None
            pdf_ratio = None
            pdf_read_failed = True

        start = time.perf_counter()
        _ = output_root / pdf_path.stem
        if is_office:
            extracted_kv = {
                "run_date": run_date,
                "type": None,
                "sender": None,
                "brutto": None,
                "netto": None,
                "tax_id": None,
                "receiver_ok": None,
                "receiver_address_ok": None,
            }
            score_kv = {
                "type": None,
                "sender": None,
                "brutto": None,
                "netto": None,
                "tax_id": None,
                "receiver_ok": None,
                "receiver_address_ok": None,
            }
        else:
            extracted_kv = {llm_field: None for llm_field in prompts_dict[purpose]["fields"]}
            score_kv = {llm_field: None for llm_field in prompts_dict[purpose]["fields"]}
            score_kv.pop("run_date", None)
            extracted_kv["run_date"] = run_date
        result_entry = {
            "filename": pdf_path.name,
            "result": extracted_kv,
            "score": score_kv,
            "category": category,
            "page_count": pdf_page_count,
            "process_duration": {},
        }
        if pdf_read_failed:
            extracted_kv["brutto"] = None
            extracted_kv["netto"] = None
            score_kv["brutto"] = None
            score_kv["netto"] = None
            result_entry["proc_time"] = time.perf_counter() - start
            return result_entry

        if pdf_page_count == 1 and pdf_ratio is not None and pdf_ratio > THRESHOLD_RECEIPT_RATIO:
            file_type = "receipt"
        model_id = f"prebuilt-{file_type}"
        time_now, result_entry["process_duration"]["preproc_time"] = calc_proc_time(start)
        azure_result = None
        office_fields = {}
        if pdf_page_count is not None and pdf_page_count > max_pages:
            result_entry["skip_reason"] = f"page_count>{max_pages}"
        else:
            try:
                print(f"[Azure] 调用: {pdf_path.name} | model={model_id}")
                from bills_analysis.extract_by_azure_api import analyze_document_with_azure, clean_invoice_json

                if is_office:
                    azure_result, office_fields = analyze_document_with_azure(
                        str(pdf_path),
                        model_id=model_id,
                        return_fields=True,
                    )
                    office_fields = clean_invoice_json(office_fields)
                else:
                    azure_result = analyze_document_with_azure(str(pdf_path), model_id=model_id)
            except Exception as exc:
                print(f"[Azure] 调用失败: file={pdf_path.name} model={model_id} error={exc}")
                extracted_kv["brutto"] = None
                extracted_kv["netto"] = None
                score_kv["brutto"] = None
                score_kv["netto"] = None
                azure_result = None
        time_now, result_entry["process_duration"]["proc_time"] = calc_proc_time(time_now)
        if azure_result:
            if is_office:
                extracted_kv["brutto"] = azure_result.get("brutto")
                extracted_kv["netto"] = azure_result.get("netto")
                extracted_kv["tax_id"] = azure_result.get("invoice_id")
                score_kv["brutto"] = azure_result.get("confidence_brutto")
                score_kv["netto"] = azure_result.get("confidence_netto")
                score_kv["tax_id"] = azure_result.get("confidence_invoice_id")
                from bills_analysis.extract_by_azure_api import extract_office_invoice_azure

                office_info = extract_office_invoice_azure(office_fields)
                extracted_kv["type"] = office_info.get("purpose")
                extracted_kv["sender"] = office_info.get("sender")
                receiver = office_info.get("receiver")
                extracted_kv["receiver_name"] = receiver
                receiver_address = office_info.get("receiver_address")
                extracted_kv["receiver_address"] = receiver_address
                expected = resolve_expected_receiver_from_metadata(batch_metadata)
                correct_receiver = expected["receiver_name"].strip()
                expected_address = expected["receiver_address"].strip()
                extracted_kv["receiver_ok"] = resolve_receiver_ok(
                    office_info,
                    expected_receiver=correct_receiver,
                    expected_address=expected_address,
                )
                if isinstance(receiver_address, str) and receiver_address.strip():
                    extracted_kv["receiver_address_ok"] = match_receiver_address(receiver_address, expected_address)
                else:
                    extracted_kv["receiver_address_ok"] = None
            else:
                store_name = azure_result.get("store_name").split("\n")[0].split(".")[0]
                value_map = {
                    "brutto": azure_result.get("brutto"),
                    "netto": azure_result.get("netto"),
                    "store_name": store_name[0].upper() + store_name[1:],
                    "total_tax": azure_result.get("total_tax"),
                }
                for key, value in value_map.items():
                    if key in extracted_kv and value not in (None, "", "None"):
                        extracted_kv[key] = str(value)
                score_kv["brutto"] = azure_result.get("confidence_brutto")
                score_kv["netto"] = azure_result.get("confidence_netto")
                score_kv["store_name"] = azure_result.get("confidence_store_name")
                score_kv["total_tax"] = azure_result.get("confidence_total_tax")

        archive_dir = backup_dest_dir / get_archive_subdir_name(run_date, category)
        final_pdf = None
        try:
            from bills_analysis.preprocess import compress_image_only_pdf

            name_suffix = str(time.time_ns())
            compressed_pdf = compress_image_only_pdf(
                pdf_path,
                dest_dir=archive_dir,
                dpi=dpi,
                name_suffix=name_suffix,
            )
            final_pdf = compressed_pdf
            new_name = get_compressed_pdf_name(category, extracted_kv, run_date)

            if new_name:
                target = compressed_pdf.parent / new_name
                if not target.exists():
                    compressed_pdf.rename(target)
                    final_pdf = target
        except Exception:
            final_pdf = None
        if final_pdf is not None:
            result_entry["preview_path"] = str(final_pdf)
        _, result_entry["process_duration"]["postproc_time"] = calc_proc_time(time_now)
        return result_entry
