from __future__ import annotations
"""Validate the local webapp launcher PowerShell script in dry-run mode."""

import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "dev_webapp.ps1"


def _run_script(*args: str) -> subprocess.CompletedProcess[str]:
    """Execute the launcher script with PowerShell and capture stdout/stderr."""

    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(SCRIPT_PATH),
            *args,
        ],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )


def test_dev_webapp_script_self_mode_dry_run_prints_expected_commands() -> None:
    """Self mode should use the self frontend script and default backend port 8000."""

    result = _run_script("-Mode", "self", "-DryRun")
    assert result.returncode == 0, result.stderr
    assert "Mode: self" in result.stdout
    assert "PORT=8000" in result.stdout
    assert "invoice-web-api" in result.stdout
    assert "pnpm --dir frontend dev:self" in result.stdout


def test_dev_webapp_script_test_mode_dry_run_prints_expected_commands() -> None:
    """Test mode should use the test frontend script and isolated backend port 8001."""

    result = _run_script("-Mode", "test", "-DryRun")
    assert result.returncode == 0, result.stderr
    assert "Mode: test" in result.stdout
    assert "PORT=8001" in result.stdout
    assert "CORS_ALLOW_ORIGINS=http://127.0.0.1:5174,http://localhost:5174" in result.stdout
    assert "pnpm --dir frontend dev:test" in result.stdout
