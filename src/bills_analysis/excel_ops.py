from __future__ import annotations

from datetime import date, datetime
import re
from typing import Any


def normalize_header(text: Any) -> str:
    if text is None:
        return ""
    s = str(text).strip().lower()
    s = s.replace("?", "")
    s = " ".join(s.split())
    return s


def normalize_date(value: Any) -> str | None:
    """Normalize diverse date/datetime inputs into DD/MM/YYYY string."""

    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    text = str(value).strip()
    if not text or text.lower() == "none":
        return None
    try:
        if re.match(r"^\d{4}-\d{2}-\d{2}$", text):
            dt = datetime.strptime(text, "%Y-%m-%d")
            return dt.strftime("%d/%m/%Y")
        if re.match(r"^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$", text):
            dt = datetime.strptime(text, "%Y-%m-%d %H:%M:%S")
            return dt.strftime("%d/%m/%Y")
        if re.match(r"^\d{4}/\d{1,2}/\d{1,2}$", text):
            dt = datetime.strptime(text, "%Y/%m/%d")
            return dt.strftime("%d/%m/%Y")
        if re.match(r"^\d{4}/\d{1,2}/\d{1,2}\s+\d{1,2}:\d{2}:\d{2}$", text):
            dt = datetime.strptime(text, "%Y/%m/%d %H:%M:%S")
            return dt.strftime("%d/%m/%Y")
        if re.match(r"^\d{2}/\d{2}/\d{4}$", text):
            return text
        if re.match(r"^\d{2}/\d{2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}$", text):
            dt = datetime.strptime(text, "%d/%m/%Y %H:%M:%S")
            return dt.strftime("%d/%m/%Y")
        if re.match(r"^\d{2}\.\d{2}\.\d{4}$", text):
            dt = datetime.strptime(text, "%d.%m.%Y")
            return dt.strftime("%d/%m/%Y")
    except ValueError:
        return None
    return None


def parse_datum(value: Any) -> date | None:
    """Parse Datum-like values into date object for Excel writes/compare."""

    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    normalized = normalize_date(text)
    if normalized is not None:
        text = normalized
    try:
        return datetime.strptime(text, "%d/%m/%Y").date()
    except ValueError:
        return None


def normalize_datum_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    text = str(value).strip()
    parsed = parse_datum(text)
    if parsed is not None:
        return parsed.strftime("%d/%m/%Y")
    return text


def write_datum_cell(cell: Any, value: Any) -> None:
    norm = normalize_date(value) or value
    parsed = parse_datum(norm)
    if parsed is not None:
        cell.value = parsed
    else:
        cell.value = value
    cell.number_format = "DD/MM/YYYY"


def to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text.lower() == "none":
        return None
    text = re.sub(r"[^\d,.\-]", "", text)
    if not text or text in {"-", ".", ","}:
        return None
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "")
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    else:
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def to_score(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text.lower() == "none":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def threshold_for(key: str, thresholds: dict[str, Any]) -> float:
    fields = thresholds.get("fields") or {}
    if isinstance(fields, dict) and key in fields:
        return float(fields[key])
    return float(thresholds.get("default", 0.8))


def low_confidence_fields(
    result: dict[str, Any],
    score: dict[str, Any],
    thresholds: dict[str, Any],
) -> set[str]:
    low: set[str] = set()
    fields_to_check = ["brutto", "netto"]
    for field in fields_to_check:
        value = result.get(field)
        if value in (None, "", "None"):
            low.add(field)
            continue
        score_val = to_score(score.get(field))
        if field in {"brutto", "netto"} and score_val == -1:
            score_val = to_score(score.get("total_tax"))
            if score_val is None or score_val < threshold_for("total_tax", thresholds):
                low.add(field)
            continue
        if score_val is None:
            low.add(field)
            continue
        if score_val < threshold_for(field, thresholds):
            low.add(field)
    return low


def needs_review(
    result: dict[str, Any],
    score: dict[str, Any],
    thresholds: dict[str, Any],
) -> bool:
    return bool(low_confidence_fields(result, score, thresholds))


def compute_low_headers(
    items: list[dict[str, Any]],
    thresholds: dict[str, Any],
    datum: str,
    *,
    max_zbon: int = 5,
) -> set[str]:
    low_headers: set[str] = set()
    zbon_idx = 0
    for item in items:
        result = item.get("result") or {}
        score = item.get("score") or {}
        run_date = normalize_date(result.get("run_date")) or "UNKNOWN"
        if run_date != datum:
            continue
        category = str(item.get("category") or "").strip().lower()
        low_fields = low_confidence_fields(result, score, thresholds)
        if not low_fields:
            continue
        if category == "zbon":
            if "brutto" in low_fields:
                low_headers.add("Umsatz Brutto")
            if "netto" in low_fields:
                low_headers.add("Umsatz Netto")
        elif category == "bar":
            zbon_idx += 1
            if zbon_idx > max_zbon:
                continue
            if "store_name" in low_fields:
                low_headers.add(f"Ausgabe {zbon_idx} Name")
            if "brutto" in low_fields:
                low_headers.add(f"Ausgabe {zbon_idx} Brutto")
            if "netto" in low_fields:
                low_headers.add(f"Ausgabe {zbon_idx} Netto")
    return low_headers


def build_rows_with_meta(
    items: list[dict[str, Any]],
    thresholds: dict[str, Any],
    *,
    max_zbon: int = 5,
) -> tuple[list[dict[str, Any]], dict[str, list[str]]]:
    rows: dict[str, dict[str, Any]] = {}
    zbon_files_by_date: dict[str, list[str]] = {}

    for item in items:
        category = str(item.get("category") or "").strip().lower()
        result = item.get("result") or {}
        score = item.get("score") or {}
        run_date = normalize_date(result.get("run_date")) or "UNKNOWN"

        row = rows.get(run_date)
        if row is None:
            row = {
                "Datum": run_date,
                "Umsatz Brutto": None,
                "Umsatz Netto": None,
                "need review": False,
                "Wie viel Rechnungen": 0,
                "_zbon_count": 0,
                "Ausgaben": [],
            }
            rows[run_date] = row
            zbon_files_by_date.setdefault(run_date, [])

        brutto = to_float(result.get("brutto"))
        netto = to_float(result.get("netto"))
        store = str(result.get("store_name") or "").strip()
        bill_id = str(result.get("bill_id") or "").strip() or None

        if category == "zbon":
            row["Umsatz Brutto"] = brutto
            row["Umsatz Netto"] = netto
        elif category == "bar":
            row["_zbon_count"] += 1
            if len(row["Ausgaben"]) < max_zbon:
                row["Ausgaben"].append(
                    {"Name": store, "Rechnung-Nr": bill_id, "Brutto": brutto, "Netto": netto}
                )
                zbon_files_by_date[run_date].append(str(item.get("filename") or ""))
            row["Wie viel Rechnungen"] = row["_zbon_count"]

        if needs_review(result, score, thresholds):
            row["need review"] = True

    output_rows: list[dict[str, Any]] = []
    for row in rows.values():
        out = {
            "Datum": row["Datum"],
            "Umsatz Brutto": row["Umsatz Brutto"],
            "Umsatz Netto": row["Umsatz Netto"],
            "need review": row["need review"],
            "Wie viel Rechnungen": row["Wie viel Rechnungen"],
        }
        for idx in range(max_zbon):
            key_base = f"Ausgabe {idx + 1}"
            if idx < len(row["Ausgaben"]):
                item = row["Ausgaben"][idx]
                out[f"{key_base} Name"] = item["Name"]
                out[f"{key_base} Rechnung-Nr"] = item["Rechnung-Nr"]
                out[f"{key_base} Brutto"] = item["Brutto"]
                out[f"{key_base} Netto"] = item["Netto"]
            else:
                out[f"{key_base} Name"] = None
                out[f"{key_base} Rechnung-Nr"] = None
                out[f"{key_base} Brutto"] = None
                out[f"{key_base} Netto"] = None
        output_rows.append(out)

    return output_rows, zbon_files_by_date


def build_rows(
    items: list[dict[str, Any]],
    thresholds: dict[str, Any],
    *,
    max_zbon: int = 5,
) -> list[dict[str, Any]]:
    rows, _ = build_rows_with_meta(items, thresholds, max_zbon=max_zbon)
    return rows


def merge_validated_row(
    validated_headers: list[str],
    validated_row: list[Any],
    monthly_headers: list[str],
) -> tuple[dict[str, Any], list[str]]:
    header_map = {}
    for name in monthly_headers:
        key = normalize_header(name)
        if key and key not in header_map:
            header_map[key] = name

    validated_map = {}
    for h, v in zip(validated_headers, validated_row):
        validated_map[normalize_header(h)] = v

    updates: dict[str, Any] = {}
    missing: list[str] = []
    for h, v in zip(validated_headers, validated_row):
        if normalize_header(h) == normalize_header("need review"):
            continue
        key = normalize_header(h)
        target_header = header_map.get(key)
        if target_header is None:
            missing.append(h)
            continue
        if normalize_header(h) == normalize_header("Datum"):
            parsed_date = parse_datum(v)
            updates[target_header] = parsed_date if parsed_date is not None else v
            continue
        if key.endswith(" name") and key.startswith("ausgabe"):
            name_val = str(v).strip() if v is not None else ""
            brutto_key = key.replace(" name", " brutto")
            brutto_val = validated_map.get(brutto_key)
            brutto_text = ""
            if brutto_val is not None and str(brutto_val).strip() != "":
                brutto_text = str(brutto_val).strip()
            updates[target_header] = f"{name_val} {brutto_text}".strip()
            continue
        updates[target_header] = v

    return updates, missing
