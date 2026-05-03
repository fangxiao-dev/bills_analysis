from __future__ import annotations

from pathlib import Path

from bills_analysis.integrations.app_config import DEFAULT_APP_CONFIG_PATH, resolve_app_config_path


def test_default_app_config_path_is_config_app_config_json(monkeypatch) -> None:
    """Runtime app config should live outside tests by default."""

    monkeypatch.delenv("APP_CONFIG_PATH", raising=False)

    assert DEFAULT_APP_CONFIG_PATH == Path("config") / "app_config.json"
    assert resolve_app_config_path() == Path("config") / "app_config.json"


def test_app_config_path_can_be_overridden(monkeypatch, tmp_path: Path) -> None:
    """Tests and deployments can override the shared runtime config path."""

    custom = tmp_path / "custom.json"
    monkeypatch.setenv("APP_CONFIG_PATH", str(custom))

    assert resolve_app_config_path() == custom
