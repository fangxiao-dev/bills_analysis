from __future__ import annotations

"""Tests for office receiver city mapping resolution."""

import json
from pathlib import Path

from bills_analysis.integrations.office_receiver_mapping import (
    get_office_receiver_options,
    resolve_expected_receiver_from_metadata,
)


def test_office_receiver_options_contains_dortmund_default() -> None:
    """Default runtime config should expose at least Dortmund option."""

    payload = get_office_receiver_options()
    assert payload["default_city"] == "Dortmund"
    assert any(item["city"] == "Dortmund" for item in payload["options"])


def test_resolve_expected_receiver_falls_back_to_default_city(
    monkeypatch,
    tmp_path: Path,
) -> None:
    """Unknown selected city should fall back to configured default city mapping."""

    custom_config = tmp_path / "receiver_config.json"
    custom_config.write_text(
        json.dumps(
            {
                "office_receiver_mapping": {
                    "default_city": "Essen",
                    "name_prefix": "Ramen Ippin ",
                    "name_suffix": " GmbH",
                    "cities": {
                        "Essen": {
                            "address": "Demo Str. 1 45127 Essen",
                        }
                    },
                }
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv("OFFICE_RECEIVER_CONFIG_PATH", str(custom_config))

    resolved = resolve_expected_receiver_from_metadata({"office_receiver_city": "Dortmund"})
    assert resolved["city"] == "Essen"
    assert resolved["receiver_name"] == "Ramen Ippin Essen GmbH"
    assert resolved["receiver_address"] == "Demo Str. 1 45127 Essen"


def test_resolve_expected_receiver_uses_env_when_mapping_missing(
    monkeypatch,
    tmp_path: Path,
) -> None:
    """When mapping file is missing, legacy env values should be used as compatibility fallback."""

    missing_path = tmp_path / "not-exist.json"
    monkeypatch.setenv("OFFICE_RECEIVER_CONFIG_PATH", str(missing_path))
    monkeypatch.setenv("OFFICE_EXPECTED_RECEIVER", "Legacy Receiver GmbH")
    monkeypatch.setenv("OFFICE_EXPECTED_RECEIVER_ADDRESS", "Legacy Str. 9 44135 Dortmund")

    resolved = resolve_expected_receiver_from_metadata({"office_receiver_city": "Dortmund"})
    assert resolved["receiver_name"] == "Legacy Receiver GmbH"
    assert resolved["receiver_address"] == "Legacy Str. 9 44135 Dortmund"
