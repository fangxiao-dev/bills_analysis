from __future__ import annotations

"""Statistics dashboard runtime config helpers."""

import json
import os
from pathlib import Path
from typing import Any

from bills_analysis.integrations.app_config import resolve_app_config_path

DEFAULT_MANUAL_EXPENSE_TYPES = ["Personalkosten", "代付款"]
MANUAL_EXPENSE_TYPES_KEY = "statistics_manual_expense_types"


def resolve_statistics_config_path() -> Path:
    """Resolve optional override path for statistics config."""

    custom = os.getenv("STATISTICS_CONFIG_PATH", "").strip()
    if custom:
        return Path(custom)
    return resolve_app_config_path()


def _load_config(path: Path) -> dict[str, Any]:
    """Load a JSON object config with safe empty-object fallback."""

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _normalize_types(value: Any) -> list[str]:
    """Normalize configured manual expense type labels."""

    if not isinstance(value, list):
        return list(DEFAULT_MANUAL_EXPENSE_TYPES)
    seen: set[str] = set()
    types: list[str] = []
    for item in value:
        label = str(item).strip()
        key = label.casefold()
        if label and key not in seen:
            seen.add(key)
            types.append(label)
    return types or list(DEFAULT_MANUAL_EXPENSE_TYPES)


def get_manual_expense_types() -> list[str]:
    """Return configured manual Ausgabe type options."""

    payload = _load_config(resolve_statistics_config_path())
    return _normalize_types(payload.get(MANUAL_EXPENSE_TYPES_KEY))


def add_manual_expense_type(label: str) -> list[str]:
    """Append one manual Ausgabe type to config and return the updated list."""

    clean_label = label.strip()
    if not clean_label:
        raise ValueError("type must not be empty")

    path = resolve_statistics_config_path()
    payload = _load_config(path)
    types = _normalize_types(payload.get(MANUAL_EXPENSE_TYPES_KEY))
    if clean_label.casefold() not in {item.casefold() for item in types}:
        types.append(clean_label)
    payload[MANUAL_EXPENSE_TYPES_KEY] = types
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return types
