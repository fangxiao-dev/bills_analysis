from __future__ import annotations

import re
from collections import defaultdict
from typing import Any


LABEL_PATTERNS = [
    re.compile(r"\brechnung\s*[-.]?\s*(?:nr|nummer)\b", re.IGNORECASE),
    re.compile(r"\brechnungs\s*[-.]?\s*(?:nr|nummer)\b", re.IGNORECASE),
    re.compile(r"\brechnungsnummer\b", re.IGNORECASE),
    re.compile(r"\bre\.?\s*[-.]?\s*nr\b", re.IGNORECASE),
    re.compile(r"\brg\.?\s*[-.]?\s*nr\b", re.IGNORECASE),
    re.compile(r"\binvoice\s*(?:no|number|#)\b", re.IGNORECASE),
]
BELEG_LABEL_RE = re.compile(r"\bbeleg\s*[-.]?\s*(?:nr|nummer)\b", re.IGNORECASE)
LABEL_VALUE_RE = re.compile(
    r"(?P<label>(?:rechnungs?|rechnung)\s*[-.]?\s*(?:nr|nummer)|re\.?\s*[-.]?\s*nr|rg\.?\s*[-.]?\s*nr|invoice\s*(?:no|number|#))"
    r"\s*[:#.]?\s*(?P<value>[A-Z0-9][A-Z0-9 ./_-]{2,})",
    re.IGNORECASE,
)


def _to_plain(value: Any) -> Any:
    if hasattr(value, "as_dict"):
        return value.as_dict()
    return value


def _get_value(node: Any, *names: str) -> Any:
    node = _to_plain(node)
    if isinstance(node, dict):
        for name in names:
            if name in node:
                return node[name]
        return None
    for name in names:
        if hasattr(node, name):
            return getattr(node, name)
    return None


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _is_bill_id_label(text: str) -> bool:
    cleaned = _clean_text(text)
    return any(pattern.search(cleaned) for pattern in LABEL_PATTERNS)


def _clean_candidate_value(text: str) -> str:
    cleaned = _clean_text(text)
    cleaned = re.sub(r"^[\s:;#.-]+", "", cleaned)
    cleaned = re.sub(r"[\s;,.]+$", "", cleaned)
    return cleaned.replace(" ", "")


def _looks_like_bill_id(text: str) -> bool:
    cleaned = _clean_candidate_value(text)
    if not cleaned or not any(char.isdigit() for char in cleaned):
        return False
    if re.fullmatch(r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}", cleaned):
        return False
    if re.search(r"(datum|steuer|kunde|auftrag|lieferung)", text, re.IGNORECASE):
        return False
    return len(cleaned) >= 4


def _candidate_from_label_value_text(text: str) -> dict[str, Any] | None:
    match = LABEL_VALUE_RE.search(str(text or ""))
    if not match:
        return None
    value = _clean_candidate_value(match.group("value"))
    if not value:
        return None
    return {
        "value": value,
        "source": "content_regex",
        "label": _clean_text(match.group("label")),
        "raw": _clean_text(text),
    }


def _iter_tables(payload: Any) -> list[Any]:
    tables = _get_value(payload, "tables") or []
    return list(tables) if isinstance(tables, list) else []


def _iter_table_rows(table: Any) -> list[list[dict[str, Any]]]:
    cells = _get_value(table, "cells") or []
    rows: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for cell in cells:
        content = _clean_text(_get_value(cell, "content"))
        if not content:
            continue
        row_index = _get_value(cell, "row_index", "rowIndex")
        column_index = _get_value(cell, "column_index", "columnIndex")
        if row_index is None or column_index is None:
            continue
        rows[int(row_index)].append(
            {
                "row_index": int(row_index),
                "column_index": int(column_index),
                "content": content,
            }
        )
    return [sorted(row, key=lambda item: item["column_index"]) for _, row in sorted(rows.items())]


def _extract_from_tables(payload: Any) -> dict[str, Any] | None:
    for table_index, table in enumerate(_iter_tables(payload)):
        rows = _iter_table_rows(table)
        for row_offset, row in enumerate(rows):
            for cell in row:
                inline_candidate = _candidate_from_label_value_text(cell["content"])
                if inline_candidate:
                    inline_candidate.update(
                        {
                            "source": "table_cell_inline",
                            "table_index": table_index,
                            "row_index": cell["row_index"],
                            "column_index": cell["column_index"],
                        }
                    )
                    return inline_candidate
                if not _is_bill_id_label(cell["content"]):
                    continue
                value_cells = [
                    item
                    for item in row
                    if item["column_index"] > cell["column_index"]
                    and not _is_bill_id_label(item["content"])
                    and _looks_like_bill_id(item["content"])
                ]
                for value_cell in value_cells:
                    value = _clean_candidate_value(value_cell["content"])
                    if value:
                        return {
                            "value": value,
                            "source": "table_row",
                            "label": cell["content"],
                            "raw": value_cell["content"],
                            "table_index": table_index,
                            "row_index": cell["row_index"],
                            "column_index": value_cell["column_index"],
                        }
                for next_row in rows[row_offset + 1 :]:
                    below_cells = [
                        item for item in next_row if item["column_index"] == cell["column_index"]
                    ]
                    for below_cell in below_cells:
                        if not _looks_like_bill_id(below_cell["content"]):
                            continue
                        return {
                            "value": _clean_candidate_value(below_cell["content"]),
                            "source": "table_column_below",
                            "label": cell["content"],
                            "raw": below_cell["content"],
                            "table_index": table_index,
                            "row_index": below_cell["row_index"],
                            "column_index": below_cell["column_index"],
                        }
    return None


def _extract_from_content(payload: Any) -> dict[str, Any] | None:
    content_value = _get_value(payload, "content")
    content = str(content_value or "")
    if not content:
        return None
    lines = [_clean_text(line) for line in content.splitlines()]
    for line in lines:
        candidate = _candidate_from_label_value_text(line)
        if candidate:
            return candidate
    for index, line in enumerate(lines):
        if not BELEG_LABEL_RE.search(line):
            continue
        context = " ".join(lines[max(0, index - 2) : index + 1])
        if not re.search(r"\brechnung\b", context, re.IGNORECASE):
            continue
        for next_line in lines[index + 1 :]:
            if _looks_like_bill_id(next_line):
                return {
                    "value": _clean_candidate_value(next_line),
                    "source": "content_adjacent_line",
                    "label": line,
                    "raw": next_line,
                }
    return _candidate_from_label_value_text(content)


def extract_bill_id(payload: Any) -> dict[str, Any]:
    """Extract a Bar Ausgabe invoice bill ID from Azure DI tables/content."""

    candidate = _extract_from_tables(payload) or _extract_from_content(payload)
    if candidate:
        return candidate
    return {"value": None, "source": None, "label": None, "raw": None}
