# bills_analysis

> **For AI agents**: [CLAUDE.md](./CLAUDE.md) (global) | [Backend](src/bills_analysis/CLAUDE.md) | [Frontend](frontend/CLAUDE.md)

Local backend CLI skeleton for the invoice Azure API extraction PoC.

## Run style
- Preferred: `uv run invoice --help` (uses `pyproject.toml` deps).
- Alt: `python cli/main.py --help` for editable runs without install.

### Python version
- Project targets Python 3.10–3.11.

## Dependencies
- PyMuPDF for PDF rendering; Pillow for preprocessing.
- Azure Document Intelligence for extraction (`azure-ai-documentintelligence`).
- Configure `AZURE_DI_ENDPOINT` and `AZURE_DI_KEY` in `.env` (also compatible with `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` and `AZURE_DOCUMENT_INTELLIGENCE_KEY`).

## Layout
- `src/bills_analysis/`: core package and `contracts.py` for `extraction.json`.
- `src/bills_analysis/api/`: FastAPI routes.
- `src/bills_analysis/services/`: process/review/merge orchestration.
- `src/bills_analysis/integrations/`: adapter layer (azure/excel/filesystem/queue/repo).
- `src/bills_analysis/models/`: API/queue schemas.
- `src/bills_analysis/workers/`: queue task worker runtime.
- `frontend/`: frontend app placeholder (for Azure Static Web Apps).
- `cli/main.py`: local entrypoint that forwards to the Typer app.
- `tests/`: compatibility CLI wrappers + contract/parity tests.
- `data/samples/`: drop electronic and scanned PDF fixtures here.
- `outputs/`: runtime artifacts; see `outputs/extraction.example.json` for the contract.

## Usage examples
- Azure API pipeline (PDFs can be multi-page):  
  `uv run python tests/vlm_pipeline_api.py data/samples/digitized/demo.pdf --dest-dir=outputs/comp_pdf --run_date=12/01/2026 --cat=BAR`

- Run BAR + ZBon together (merged into one results JSON):  
  `uv run python tests/run_with_category.py --bar data/samples/bar/demo_bar.pdf --zbon-dir data/samples/zbon --run_date=12/01/2026`

- Convert results JSON to a one-row Excel:  
  `uv run python tests/json_to_excel_map.py outputs/vlm_pipeline/results_1770199982.json outputs/vlm_pipeline/results_1770199982.xlsx`

- Merge validated one-row Excel into monthly Excel:  
  `uv run python tests/merge_daily_excel.py results_1770202138.xlsx data/daily_sample.xlsx --out-dir outputs`

- Clean up outputs (dry run by default, add --yes to delete):  
  `uv run python tests/cleanup_outputs.py --root outputs --pattern "vlm_pipeline/*"`

## Webapp skeleton (FastAPI + Queue contract)
- Install with web extras:  
  `uv sync --extra web`
- Start API (includes inline local worker by default):  
  `uv run invoice-web-api`
- Dev CORS origins (default): `http://127.0.0.1:5173,http://localhost:5173`
  - Override with env: `CORS_ALLOW_ORIGINS=http://127.0.0.1:5173,http://localhost:5173`
- Health check:  
  `GET http://127.0.0.1:8000/healthz`
- Create batch:  
  `POST /v1/batches`
  ```json
  {
    "type": "daily",
    "run_date": "06/02/2026",
    "inputs": [
      {"path": "data/samples/bar/a.pdf", "category": "bar"},
      {"path": "data/samples/zbon/b.pdf", "category": "zbon"}
    ]
  }
  ```
- Poll batch status:  
  `GET /v1/batches/{batch_id}`
- Upload batch files (multipart):  
  `POST /v1/batches/upload`
  - Common fields: `type`, `run_date`, `metadata_json`
  - `daily`: required single `zbon_file`, optional multiple `bar_files`
  - `office`: required multiple `office_files`
- Query review rows for Manual Review page:  
  `GET /v1/batches/{batch_id}/review-rows`
- Open one preview PDF in browser:  
  `GET /v1/batches/{batch_id}/files/{row_id}/preview`
- Submit reviewed rows:  
  `PUT /v1/batches/{batch_id}/review`
  - Canonical payload (required):
  ```json
  {
    "rows": [
      {
        "row_id": "row-0001",
        "category": "bar",
        "filename": "zbon.pdf",
        "result": {
          "brutto": "12.30",
          "netto": "10.00",
          "store_name": "Demo Store"
        },
        "score": {
          "brutto": 0.95
        },
        "preview_path": "outputs/webapp/<batch_id>/archive/bar/01_zbon_xxx.pdf"
      }
    ]
  }
  ```
  - Flat editable fields at row top-level are deprecated and rejected with `422`.
- Upload local monthly excel source for merge fallback:  
  `POST /v1/batches/{batch_id}/merge-source/local` (multipart field: `file`)
- Queue merge:  
  `POST /v1/batches/{batch_id}/merge`
  - `monthly_excel_path` can be omitted if already uploaded through `/merge-source/local`

Recommended frontend flow:
1. `POST /v1/batches/upload`
2. Poll `GET /v1/batches/{batch_id}` until `status=review_ready`
3. Fetch `GET /v1/batches/{batch_id}/review-rows`
4. Submit edits with `PUT /v1/batches/{batch_id}/review`
5. Upload monthly source `POST /v1/batches/{batch_id}/merge-source/local`
6. Queue merge with `POST /v1/batches/{batch_id}/merge`

Notes:
- Current backend adapter runs preprocess + Azure extraction flow in worker threads and writes artifacts under `outputs/webapp/{batch_id}/`.
- Queue/repository are in-memory implementations; replace them with Azure Queue + persistent store later without changing API/use-case signatures.
- Legacy commands under `tests/*.py` are kept as thin wrappers; core business logic is migrated to `src/bills_analysis/services/` and `src/bills_analysis/integrations/`.

## Next steps (per PoC)
- Fill the pipeline (render → preprocess → Azure API → extract → evidence) inside `src/bills_analysis/`.
- Add golden sample PDFs and expected outputs under `data/samples/` and `tests/`.
