from __future__ import annotations

import os
from pathlib import Path


DEFAULT_APP_CONFIG_PATH = Path("config") / "app_config.json"


def resolve_app_config_path() -> Path:
    """Resolve shared runtime app config path with an environment override."""

    custom = os.getenv("APP_CONFIG_PATH", "").strip()
    if custom:
        return Path(custom)
    return DEFAULT_APP_CONFIG_PATH
