from __future__ import annotations
"""Export frozen OpenAPI v1 baseline from current FastAPI app."""

import json
from pathlib import Path


def openapi_contract_subset(spec: dict) -> dict:
    """Keep only v1 contract-relevant paths and schema components."""

    paths = {}
    for path, methods in spec.get("paths", {}).items():
        if not path.startswith("/v1/batches") and not path.startswith("/v1/statistics") and path != "/healthz":
            continue
        paths[path] = methods
    components = spec.get("components", {}).get("schemas", {})
    return {"paths": paths, "schemas": components}


def main() -> None:
    """Export current OpenAPI subset to v1 baseline file."""

    from bills_analysis.api.main import app

    out = openapi_contract_subset(app.openapi())
    out_path = Path("tests/openapi_v1_baseline.json")
    out_path.write_text(
        json.dumps(out, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(f"[openapi] written: {out_path}")


if __name__ == "__main__":
    main()
