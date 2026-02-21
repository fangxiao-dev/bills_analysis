# Findings & Decisions (20260214-1616)

## Requirements
- TC-001 backend behavior:
  - Daily merge overwrite by Datum
  - Daily append + sorted output
  - Auto-create monthly xlsx template when target file is missing

## Research Findings
- Current `merge_daily_excel` fails when Datum not found (`ValueError`) and does not append.
- Current daily flow enforces existing `monthly_excel_path` in local backend.
- `MergeRequest.mode` already supports `overwrite|append` in schema; no contract expansion required.
- `merge_office_excel` already has append concept and can be used as behavior reference.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Keep API schema unchanged (`mode: overwrite|append`) | Avoid breaking v1 contract |
| Daily overwrite becomes upsert | Satisfies “按 datum 覆盖 + 可追加” without new field |
| Introduce daily template creation when monthly file missing | Implements “无文件自动创建模板” |
| Sort daily result rows by Datum asc after merge | Satisfies deterministic output requirement |
| Restrict code changes to backend paths only | Respect Agent A/B boundary in AGENTS.md |

## Implementation Targets
- `src/bills_analysis/integrations/excel_merge_adapter.py`
- `src/bills_analysis/services/merge_service.py`
- `src/bills_analysis/integrations/local_backend.py`
- `tests/test_merge_parity.py` (+ additional backend tests if needed)

## Risks
| Issue | Mitigation |
|---|---|
| Historical monthly files may have non-canonical headers | Keep merge by normalized header; skip unknown headers safely |
| Mixed date formats in workbook | Use existing normalize/parse helpers; unparseable dates sorted to tail |
| Daily append UI currently not exposed in frontend | Backend supports now; frontend can enable later without backend change |

## Resources
- `src/bills_analysis/integrations/excel_merge_adapter.py`
- `src/bills_analysis/services/merge_service.py`
- `src/bills_analysis/integrations/local_backend.py`
- `tests/test_merge_parity.py`
- `src/bills_analysis/models/api_requests.py`