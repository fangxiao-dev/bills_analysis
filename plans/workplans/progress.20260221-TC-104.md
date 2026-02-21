# Progress: TC-104

**plan_id**: 20260221-TC-104
**last_updated**: 2026-02-21

## Status: DONE

## Completed

- [x] TC-104 added to `plans/todo_current.md` (PLANNED, bound to 20260221-TC-104)
- [x] Workplan files created (task_plan, findings, progress)
- [x] Phase 1: `skipReasonUtils.js` extracted; `ReviewCategoryTable.jsx` import updated
- [x] Phase 2: `BillUploadPage.jsx` — fetchReviewRows effect + skipReasonByName map
- [x] Phase 2: `FileQueuePanel.jsx` — skip_reason ⚠ popover + View PDF link + object-URL cache
- [x] Phase 3: `ReviewCategoryTable.jsx` — onRemoveRow prop + Remove button
- [x] Phase 3: `ManualReviewPage.jsx` — onRemoveRow handler + passed to all three tables

## Outcome

Upload page shows ⚠ icon + "View" link for files with page-limit skip_reason after batch reaches review_ready.
Review page shows Remove button for every row; removed rows are excluded from merge payload (JSON unchanged).

## Blockers

None.
