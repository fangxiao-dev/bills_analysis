# Findings & Decisions (20260214-1708)

## Requirements
- TC-002: review界面要highlight 带审查的项目（复用）

## Research Findings
- Existing low-confidence highlight already exists in `frontend/src/features/upload/components/ReviewCategoryTable.jsx` via `isLowConfidence(row, fieldKey)` and CSS class `review-cell-low-confidence`.
- `ManualReviewPage` composes category tables through `ReviewCategoryTable`, so reuse should preserve current behavior and avoid style/threshold divergence.
- Highlight threshold currently fixed at `0.5` and includes `brutto/netto` fallback to `total_tax`; this should remain unchanged in M1.
- Implemented shared utility: `frontend/src/features/upload/utils/reviewConfidence.js`.
- `ReviewCategoryTable` now applies both:
  - cell-level class `review-cell-low-confidence`
  - row-level class `review-row-needs-review` when any editable field is low confidence.

## Technical Decisions
| Decision | Rationale |
|---|---|
| Keep scope frontend-only | AGENTS.md role boundary requires Agent A to touch only `frontend/**` |
| Reuse existing low-confidence rule | Avoid duplicate scoring logic and inconsistent highlight behavior |
| Keep threshold logic unchanged (`0.5`) | Preserve current behavior and reduce contract risk in M1 |
| Validate by targeted page/component tests | Fast regression signal without broad test runtime |

## Implementation Targets
- `frontend/src/features/upload/components/ReviewCategoryTable.jsx`
- `frontend/src/features/upload/pages/ManualReviewPage.jsx`
- `frontend/src/features/upload/pages/ManualReviewPage.test.jsx`
- `frontend/src/features/upload/components/ReviewCategoryTable.test.jsx`
- `frontend/src/features/upload/utils/reviewConfidence.js`

## Risks
| Issue | Mitigation |
|---|---|
| Rule duplication across files can drift later | Prefer shared helper export/import if code change needed |
| Some rows may miss `score` object | Keep existing null-safe behavior (`no score => no highlight`) |
| Visual highlight may be too subtle for users | Keep current class first; adjust style only if product asks |

## Validation Evidence
- `pnpm test -- --run src/features/upload/components/ReviewCategoryTable.test.jsx src/features/upload/pages/ManualReviewPage.test.jsx`
- Result: 2 files passed, 12 tests passed.

## Issues Encountered
| Issue | Resolution |
|---|---|
| None at planning stage | N/A |

## Resources
- plans/todo_current.md
- plans/workplans/task_plan.20260214-1708.md
- frontend/src/features/upload/components/ReviewCategoryTable.jsx
- frontend/src/features/upload/pages/ManualReviewPage.jsx
