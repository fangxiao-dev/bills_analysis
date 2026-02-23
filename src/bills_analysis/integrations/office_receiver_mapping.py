from __future__ import annotations

"""Office receiver city mapping helpers sourced from runtime config."""

import json
import os
from pathlib import Path
from typing import Any

DEFAULT_CITY = "Dortmund"
DEFAULT_NAME_PREFIX = "Ramen Ippin "
DEFAULT_NAME_SUFFIX = " GmbH"
DEFAULT_RECEIVER_ADDRESS = "Reinoldistr.8 44135 Dortmund"
DEFAULT_RECEIVER_NAME = "Ramen Ippin Dortmund GmbH"
DEFAULT_CONFIG_PATH = Path("tests") / "config.json"


def _resolve_config_path() -> Path:
    """Resolve optional override path for office receiver mapping config."""

    custom = os.getenv("OFFICE_RECEIVER_CONFIG_PATH", "").strip()
    if custom:
        return Path(custom)
    return DEFAULT_CONFIG_PATH


def _load_json(path: Path) -> dict[str, Any]:
    """Load one JSON object from path with safe empty-object fallback."""

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def _build_city_entry(
    *,
    city: str,
    value: Any,
    name_prefix: str,
    name_suffix: str,
) -> dict[str, str] | None:
    """Normalize one city mapping row into receiver name/address pair."""

    city_name = city.strip()
    if not city_name:
        return None

    if isinstance(value, str):
        receiver_address = value.strip()
        receiver_name = f"{name_prefix}{city_name}{name_suffix}"
    elif isinstance(value, dict):
        receiver_address = str(value.get("address") or value.get("receiver_address") or "").strip()
        receiver_name = str(value.get("receiver_name") or f"{name_prefix}{city_name}{name_suffix}").strip()
    else:
        return None

    if not receiver_address or not receiver_name:
        return None
    return {
        "receiver_name": receiver_name,
        "receiver_address": receiver_address,
    }


def _load_mapping_config() -> dict[str, Any]:
    """Load normalized office receiver mapping config with defaults."""

    raw = _load_json(_resolve_config_path())
    mapping = raw.get("office_receiver_mapping")
    mapping = mapping if isinstance(mapping, dict) else {}

    raw_prefix = mapping.get("name_prefix")
    raw_suffix = mapping.get("name_suffix")
    name_prefix = raw_prefix if isinstance(raw_prefix, str) and raw_prefix != "" else DEFAULT_NAME_PREFIX
    name_suffix = raw_suffix if isinstance(raw_suffix, str) and raw_suffix != "" else DEFAULT_NAME_SUFFIX
    default_city = str(mapping.get("default_city") or DEFAULT_CITY).strip() or DEFAULT_CITY

    cities_payload = mapping.get("cities")
    cities_payload = cities_payload if isinstance(cities_payload, dict) else {}
    cities: dict[str, dict[str, str]] = {}
    for city, value in cities_payload.items():
        normalized = _build_city_entry(
            city=str(city),
            value=value,
            name_prefix=name_prefix,
            name_suffix=name_suffix,
        )
        if normalized is not None:
            cities[str(city).strip()] = normalized

    if not cities:
        env_receiver_name = os.getenv("OFFICE_EXPECTED_RECEIVER", DEFAULT_RECEIVER_NAME).strip() or DEFAULT_RECEIVER_NAME
        env_receiver_address = (
            os.getenv("OFFICE_EXPECTED_RECEIVER_ADDRESS", DEFAULT_RECEIVER_ADDRESS).strip() or DEFAULT_RECEIVER_ADDRESS
        )
        cities = {
            DEFAULT_CITY: {
                "receiver_name": env_receiver_name,
                "receiver_address": env_receiver_address,
            }
        }

    if default_city not in cities:
        default_city = next(iter(cities.keys()))

    return {
        "default_city": default_city,
        "cities": cities,
    }


def get_office_receiver_options() -> dict[str, Any]:
    """Return read-only city options for frontend office upload selection."""

    config = _load_mapping_config()
    options = [
        {
            "city": city,
            "receiver_name": entry["receiver_name"],
            "receiver_address": entry["receiver_address"],
        }
        for city, entry in config["cities"].items()
    ]
    return {
        "default_city": config["default_city"],
        "options": options,
    }


def resolve_expected_receiver_from_metadata(metadata: dict[str, Any] | None) -> dict[str, str]:
    """Resolve expected receiver values from metadata city with env fallback."""

    config = _load_mapping_config()
    selected_city = str((metadata or {}).get("office_receiver_city") or "").strip()
    city = selected_city if selected_city in config["cities"] else config["default_city"]
    entry = config["cities"].get(city)
    if entry is not None:
        return {
            "city": city,
            "receiver_name": entry["receiver_name"],
            "receiver_address": entry["receiver_address"],
        }

    receiver_name = os.getenv("OFFICE_EXPECTED_RECEIVER", DEFAULT_RECEIVER_NAME).strip()
    receiver_address = os.getenv("OFFICE_EXPECTED_RECEIVER_ADDRESS", DEFAULT_RECEIVER_ADDRESS).strip()
    return {
        "city": city or DEFAULT_CITY,
        "receiver_name": receiver_name or DEFAULT_RECEIVER_NAME,
        "receiver_address": receiver_address or DEFAULT_RECEIVER_ADDRESS,
    }
