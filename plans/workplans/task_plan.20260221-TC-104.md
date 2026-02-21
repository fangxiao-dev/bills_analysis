# Task Plan: TC-104

**plan_id**: 20260221-TC-104
**task_id**: TC-104
**status**: PLANNED
**created_at**: 2026-02-21

## Scope

Two follow-on features after TC-103's page-limit warning in review:

1. **Upload-stage page-limit warning** — Show ⚠ icon + popover + "View PDF" in FileQueuePanel when a file exceeds the page limit (data source: `state.reviewRows` fetched when `batch.status === "review_ready"`).
2. **Review-stage remove** — Add a Remove button to each row in ReviewCategoryTable, filtering the row from draft state so it's excluded from the merge payload (JSON on disk unchanged).

## Sub-tasks

- [ ] Phase 0: Add TC-104 to `todo_current.md` and create workplan files
- [ ] Phase 1: Extract `buildUserFriendlySkipReason` to `frontend/src/features/upload/utils/skipReasonUtils.js`; update `ReviewCategoryTable.jsx` import
- [ ] Phase 2: `BillUploadPage.jsx` — fetch reviewRows on review_ready; derive `skipReasonByName` map
- [ ] Phase 2: `FileQueuePanel.jsx` — add skip_reason warning (⚠ icon + popover), View PDF link, object-URL cache
- [ ] Phase 3: `ReviewCategoryTable.jsx` — add `onRemoveRow` prop + Remove button
- [ ] Phase 3: `ManualReviewPage.jsx` — add `onRemoveRow` handler; pass to tables
- [ ] Phase 4: Update progress, mark DONE, commit

## Acceptance Criteria

- After batch reaches `review_ready`, ⚠ appears in FileQueuePanel for files with `skip_reason`.
- Clicking ⚠ shows the page-limit popover message (same as review page).
- "View" link in FileQueuePanel opens the PDF in a new browser tab.
- Every row in ManualReviewPage's review tables has a Remove button.
- Clicking Remove filters the row from draft; `totalRows` KPI decreases.
- Merge payload excludes removed rows.
- Extracted JSON files on disk are unchanged.
- No new backend API changes; `test_api_schema_v1.py` passes.
