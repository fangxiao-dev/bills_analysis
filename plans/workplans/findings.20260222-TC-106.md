# Findings & Decisions (20260222-TC-106)

## Requirements
- TC-106: office receiver城市化：Upload选择城市，按配置自动匹配地址并参与receiver校验（地址只读、可扩展mapping）

## Research Findings
- Existing receiver consistency check currently depends on env vars in `src/bills_analysis/integrations/local_backend.py`.
- Upload endpoint `/v1/batches/upload` already accepts `metadata_json`, and metadata is persisted in batch model.
- Upload UI already has office-specific branch in `frontend/src/features/upload/pages/BillUploadPage.jsx`; city selector can be introduced there without impacting daily flow.
- Current codebase has no backend endpoint that exposes office receiver options to frontend.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Use backend single source mapping config | Avoid frontend/backend drift and keep future city extension as config-only change. |
| Keep city in batch metadata (`office_receiver_city`) | Reuses existing upload contract path, avoids breaking `v1` schema fields. |
| Keep existing `v1` fields unchanged | M1 schema freeze requires non-breaking evolution. |
| Default city remains Dortmund | Must preserve current behavior and operational baseline. |
| Address stays read-only in Upload UI | Matches requirement and reduces validation complexity. |

## Issues Encountered
| Issue | Resolution |
|---|---|
| `uv run` in sandbox cannot access local uv cache | Use approved escalated execution for `plan_tracker` commands. |

## Resources
- plans/todo_current.md
- plans/workplans/task_plan.20260222-TC-106.md
- src/bills_analysis/integrations/local_backend.py
- src/bills_analysis/api/main.py
- frontend/src/features/upload/pages/BillUploadPage.jsx
