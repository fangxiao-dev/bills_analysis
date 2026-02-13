from __future__ import annotations

"""Write SESSION_NOTES records for multi-agent handoff."""

import argparse
import json
import re
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_NOTES = ROOT / "SESSION_NOTES.md"
DEFAULT_STATUS = "OPEN"


def _run_git(args: list[str]) -> str:
    """Run a git command in repo root and return stripped stdout on success."""
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def _now_iso() -> str:
    """Return local timestamp with timezone in ISO-8601 seconds precision."""
    return datetime.now().astimezone().isoformat(timespec="seconds")


def _read_fenced_records(path: Path) -> list[dict[str, Any]]:
    """Read records only from fenced ```json blocks."""
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    in_json_fence = False
    fenced_lines: list[str] = []

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if in_json_fence:
            if line.startswith("```"):
                payload = "\n".join(fenced_lines).strip()
                fenced_lines = []
                in_json_fence = False
                if not payload:
                    continue
                try:
                    parsed = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    records.append(parsed)
                continue
            fenced_lines.append(raw_line)
            continue

        if re.match(r"^```json\s*$", line, flags=re.IGNORECASE):
            in_json_fence = True
            fenced_lines = []
            continue
    return records


def _next_id(records: list[dict[str, Any]], prefix: str) -> str:
    """Generate next incremental id like C-001 based on parsed records."""
    pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
    max_num = 0
    for record in records:
        raw_id = str(record.get("id", ""))
        match = pattern.match(raw_id)
        if not match:
            continue
        max_num = max(max_num, int(match.group(1)))
    return f"{prefix}-{max_num + 1:03d}"


def _build_who(agent: str, side: str) -> dict[str, str]:
    """Build the who payload with actor identity and current git context."""
    branch = _run_git(["rev-parse", "--abbrev-ref", "HEAD"]) or "UNKNOWN"
    head = _run_git(["rev-parse", "--short", "HEAD"]) or "UNKNOWN"
    return {
        "agent": agent,
        "side": side,
        "branch": branch,
        "head": head,
    }


def _build_what(what_items: list[str], why: str | None) -> list[str]:
    """Build the what array and append why context when provided."""
    values = [item.strip() for item in what_items if item.strip()]
    if why:
        values.append(f"why: {why.strip()}")
    return values


def _format_record_fenced_json(record: dict[str, Any]) -> str:
    """Format one record as fenced JSON with top-level one-field-per-line layout."""
    keys = list(record.keys())
    lines = ["{"]
    for index, key in enumerate(keys):
        value = json.dumps(record[key], ensure_ascii=False, separators=(",", ":"))
        comma = "," if index < len(keys) - 1 else ""
        lines.append(f'  "{key}": {value}{comma}')
    lines.append("}")
    return "```json\n" + "\n".join(lines) + "\n```"


def _append_record_block(path: Path, record: dict[str, Any]) -> None:
    """Append one fenced JSON record block while preserving readable spacing."""
    block = _format_record_fenced_json(record)
    sep = ""
    if path.exists():
        existing = path.read_text(encoding="utf-8")
        if existing:
            if existing.endswith("\n\n"):
                sep = ""
            elif existing.endswith("\n"):
                sep = "\n"
            else:
                sep = "\n\n"
    with path.open("a", encoding="utf-8", newline="\n") as file:
        file.write(sep + block + "\n")


def cmd_log(path: Path, args: argparse.Namespace) -> None:
    """Write one OPEN fenced-JSON handoff entry into SESSION_NOTES."""
    records = _read_fenced_records(path)
    record_id = args.id if args.id else _next_id(records, args.id_prefix)
    what = _build_what(args.what, args.why)
    if not what:
        raise ValueError("at least one --what is required")

    next_owner = args.next_owner if args.next_owner else args.agent
    record: dict[str, Any] = {
        "id": record_id,
        "ts": _now_iso(),
        "status": DEFAULT_STATUS,
        "scope": args.scope,
        "who": _build_who(args.agent, args.side),
        "what": what,
        "next": {
            "goal": args.next_goal,
            "owner": next_owner,
        },
    }
    if args.dep:
        record["dep"] = [item.strip() for item in args.dep if item.strip()]
    if args.risk:
        record["risk"] = [item.strip() for item in args.risk if item.strip()]

    _append_record_block(path, record)
    print(f"[session-notes] log appended to {path}: {record_id}")


def build_parser() -> argparse.ArgumentParser:
    """Create CLI parser for fenced-JSON session notes logging."""
    parser = argparse.ArgumentParser(
        description="Write SESSION_NOTES.md as fenced JSON entries for multi-agent collaboration."
    )
    parser.add_argument(
        "--notes-path",
        type=Path,
        default=DEFAULT_NOTES,
        help="Path of notes file (default: repo root/SESSION_NOTES.md).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_log = sub.add_parser("log", help="Append one OPEN fenced-JSON handoff record.")
    p_log.add_argument("--id", help="Explicit record id (e.g. C-007). Optional.")
    p_log.add_argument(
        "--id-prefix",
        default="C",
        help="Prefix for auto id generation, default C.",
    )
    p_log.add_argument("--scope", required=True, help="Scope summary, e.g. upload-review chain.")
    p_log.add_argument("--agent", required=True, help="Agent identity, e.g. agent-a.")
    p_log.add_argument("--side", required=True, help="Work side, e.g. frontend/backend.")
    p_log.add_argument(
        "--what",
        action="append",
        default=[],
        help="One change/action item. Can be repeated.",
    )
    p_log.add_argument("--why", help="Optional motivation text, appended into what[] as why.")
    p_log.add_argument(
        "--dep",
        action="append",
        default=[],
        help="Optional dependency item. Can be repeated.",
    )
    p_log.add_argument(
        "--risk",
        action="append",
        default=[],
        help="Optional risk/technical-debt item. Can be repeated.",
    )
    p_log.add_argument("--next-goal", required=True, help="Next concrete goal.")
    p_log.add_argument("--next-owner", help="Owner for next goal. Default is --agent.")
    return parser


def main() -> None:
    """Parse CLI arguments and dispatch command handlers."""
    parser = build_parser()
    args = parser.parse_args()
    notes_path: Path = args.notes_path

    if args.command == "log":
        cmd_log(notes_path, args)
        return

    parser.error(f"unknown command: {args.command}")


if __name__ == "__main__":
    main()

