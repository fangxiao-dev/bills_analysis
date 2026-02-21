# Findings: TC-104

**plan_id**: 20260221-TC-104

## Architecture Decisions

### Why use `state.reviewRows` for upload-stage warning (not `state.batch.inputs`)

`state.batch.inputs` (`InputFile[]`) contains only `path` and `category` — no `skip_reason`. The `skip_reason` is populated by the backend pipeline and exposed in `GET /batches/{id}/review-rows` (`BatchReviewRow.skip_reason`). Therefore the upload page must fetch review rows to obtain this data.

Pattern: same `useEffect` already used in ManualReviewPage — trigger `actions.fetchReviewRows()` when `batch.status === "review_ready"`. Since both pages share `useUploadFlowContext`, `state.reviewRows` is shared and hydrated.

### Shared utility for `buildUserFriendlySkipReason`

The function is currently private in `ReviewCategoryTable.jsx`. FileQueuePanel needs the same logic. Extraction to `frontend/src/features/upload/utils/skipReasonUtils.js` is consistent with the existing `reviewConfidence.js` util in the same directory.

### Reuse of existing CSS + i18n

- CSS classes `review-skip-icon-btn` and `review-skip-popover` in `styles.css` are reused unchanged.
- No new translation keys — reuse `review.table.view`, `common.remove`, `review.skipReasonAria`, `review.skipReasonExceeded`, `review.skipReasonFallback`.

### Review-stage remove: frontend-only, no backend call

Removing a row in review is a local draft-state operation. `composeReviewRows(draft)` only serializes rows present in the draft arrays, so absent rows are naturally excluded from the merge payload. The JSON files on disk (extracted results) are untouched.

## Risk Notes

- Low risk: no API contract changes, no backend modifications.
- Object URLs created for PDF preview in FileQueuePanel must be revoked on unmount to avoid memory leaks — handled via `useRef` cache + cleanup `useEffect`.
- If `state.reviewRows` haven't loaded yet when user views FileQueuePanel (e.g. status not yet `review_ready`), `skipReasonByName` is an empty Map and no warnings show — this is the correct progressive-disclosure behavior.
