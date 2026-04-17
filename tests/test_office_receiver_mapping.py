from __future__ import annotations

"""Tests for office receiver city mapping resolution."""

import json
from pathlib import Path

from bills_analysis.integrations.office_receiver_mapping import (
    get_office_receiver_options,
    resolve_expected_receiver_from_metadata,
)


def test_office_receiver_options_contains_dortmund_default() -> None:
    """Configured runtime options should expose the expected office receiver cities."""

    payload = get_office_receiver_options()
    assert payload["default_city"] == "Dortmund"
    cities = {item["city"] for item in payload["options"]}
    assert cities == {"Dortmund", "Kaiserslautern", "Mainz", "Kassel", "Europa", "Düsseldorf"}

    mapping = {item["city"]: item for item in payload["options"]}
    assert mapping["Kaiserslautern"]["receiver_name"] == "Ramen Ippin Kaiserslautern GmbH"
    assert mapping["Kaiserslautern"]["receiver_address"] == "Reinoldistr.8 44135 Dortmund"
    assert mapping["Mainz"]["receiver_name"] == "Ramen Ippin Göttingen GmbH"
    assert mapping["Mainz"]["receiver_address"] == "Reinoldistr.8 44135 Dortmund"
    assert mapping["Kassel"]["receiver_name"] == "IP Kassel GmbH"
    assert mapping["Kassel"]["receiver_address"] == "Reinoldistr.8 44135 Dortmund"
    assert mapping["Europa"]["receiver_name"] == "Ramen Ippin Europa GmbH"
    assert mapping["Europa"]["receiver_address"] == "Reinoldistr.8 44135 Dortmund"
    assert mapping["Düsseldorf"]["receiver_name"] == "Fujigawa Food GmbH"
    assert mapping["Düsseldorf"]["receiver_address"] == "Dreischeibenhaus 1 40211 Düsseldorf"


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


def test_resolve_expected_receiver_uses_explicit_receiver_name_and_address(
    monkeypatch,
    tmp_path: Path,
) -> None:
    """Explicit receiver mappings should override prefix-generated defaults for special cases."""

    custom_config = tmp_path / "receiver_config.json"
    custom_config.write_text(
        json.dumps(
            {
                "office_receiver_mapping": {
                    "default_city": "Düsseldorf",
                    "name_prefix": "Ramen Ippin ",
                    "name_suffix": " GmbH",
                    "cities": {
                        "Düsseldorf": {
                            "receiver_name": "Fujigawa Food GmbH",
                            "address": "Dreischeibenhaus 1 40211 Düsseldorf",
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

    resolved = resolve_expected_receiver_from_metadata({"office_receiver_city": "Düsseldorf"})
    assert resolved["city"] == "Düsseldorf"
    assert resolved["receiver_name"] == "Fujigawa Food GmbH"
    assert resolved["receiver_address"] == "Dreischeibenhaus 1 40211 Düsseldorf"


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
