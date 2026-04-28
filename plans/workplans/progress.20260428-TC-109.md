# Progress For TC-109

## 2026-04-28

- Captured Playwright screenshots for statistics upload and result states.
- User approved the optimization direction.
- Created plan files and bound task `TC-109`.
- Added failing StatisticsPage tests for all-expense Details default and category filtering, then implemented the behavior.
- Combined Expense Breakdown and Details into one master-detail section.
- Rebalanced desktop results so ProfitBridge and DailyTrend share the first result row.
- Compressed responsive layout: mobile KPI is two columns and Details now appears substantially earlier.
- Verification passed:
  - `npx vitest run src/features/statistics/pages/StatisticsPage.test.jsx`
  - `npm run test -- --run`
  - `npm run build`
- Playwright metrics:
  - Desktop Details y-position improved from about `1170` to `664`.
  - Mobile Details y-position improved from about `2094` to `1336`.
  - Default Details row count in the screenshot fixture is `14`.

## Next

- Apply follow-up UI fixes requested by user:
  - Profit bridge labels should float above bars.
  - Daily trend hover tooltip should align with the hovered point.
  - Expense structure should stack pie above category grid, use two columns after enough categories, enlarge pie, and keep selected slices visually exploded.
- `plans/todo_current.md` correction: executors must not mark tasks `DONE` without explicit user approval. `TC-109` was returned to `PLANNED`.
- Updated planning skill instructions in:
  - `D:\CodeSpace\prj_rechnung\dev\.agents\skills\planning-with-files\SKILL.md` (project-local ignored skill copy)
  - `D:\CodeSpace\agent-workbench\skills\planning-with-files\SKILL.md` (tracked upstream workbench skill)
- Added chart refinement tests in `frontend/src/features/statistics/components/StatisticsCharts.test.jsx`.
- Implemented chart refinements:
  - Profit bridge labels are above bars.
  - Daily trend tooltip is centered on the hovered point.
  - Expense structure stacks pie above category grid, switches to two columns at 9+ categories, enlarges pie, and keeps selected slice exploded.
- Verification passed:
  - `npx vitest run src/features/statistics/components/StatisticsCharts.test.jsx`
  - `npx vitest run src/features/statistics/pages/StatisticsPage.test.jsx src/features/statistics/components/StatisticsCharts.test.jsx`
  - `npm run test -- --run`
  - `npm run build`
- Playwright refinement screenshot:
  - `frontend/test-results/statistics-refined-hover-desktop.png`
  - `tooltipCenterDelta: 0`

## Follow-up Refinement

- Implemented requested detail refinements:
  - Tagesverlauf now has a vertical axis with value tick labels.
  - Expense pie is enlarged and shows category plus Brutto amount in the hover tooltip.
  - Details table now includes both Brutto and Netto. Netto is displayed for detail rows but remains excluded from pie statistics.
  - Einnahmen vs. Ausgaben draws negative values below the baseline. Revenue uses muted blue, Daily/Office muted red, and Profit muted green.
- Verification passed:
  - `npx vitest run src/features/statistics/components/StatisticsCharts.test.jsx src/features/statistics/pages/StatisticsPage.test.jsx`
  - `npm run test -- --run`
  - `npm run build`
- Final Playwright screenshots and metrics:
  - `frontend/test-results/statistics-final-trend-hover.png`
  - `frontend/test-results/statistics-final-pie-hover.png`
  - `frontend/test-results/statistics-final-metrics.json`
  - Metrics confirmed `yAxisPresent: true`, `profitBarStartsAtBaseline: true`, `detailsHeaders: Datum/Typ/Name/Brutto/Netto`, `detailsTextContainsNetto: true`, `categoryHasTwoColumns: true`, and pie tooltip contains category plus Brutto amount.

## Pie Tooltip Refinement

- Enlarged the expense pie again to a 465px desktop target, matching the requested 1.5x diameter from the previous 310px implementation.
- Changed the selected/hover tooltip from a fixed top-right SVG box to a slice-aware left/right docked window.
- Tooltip width now scales for longer category names so text is not clipped.
- Added a regression test for selected pie tooltip visibility and long label width.
- Verification passed:
  - `npx vitest run src/features/statistics/components/StatisticsCharts.test.jsx src/features/statistics/pages/StatisticsPage.test.jsx`
  - `npm run test -- --run`
  - `npm run build`
- Playwright screenshot and metrics:
  - `frontend/test-results/statistics-pie-selected-tooltip-enlarged.png`
  - `frontend/test-results/statistics-pie-selected-tooltip-enlarged-metrics.json`
  - Metrics confirmed `pieCssWidth: 465`, selected tooltip text `RamenIppin Europa8.490,42 €`, `tooltipRectWidth: 190`, `tooltipTextFitsRect: true`, and selected slice transform is active.

## Hover Tooltip And Netto Fix

- Changed the expense pie tooltip so it appears only while hovering a slice. Selecting a category still keeps the slice exploded and filters Details, but does not keep the tooltip box visible.
- Root cause for empty Details Netto:
  - Frontend displayed `row.netto` correctly when present.
  - Backend statistics response models did not include `netto` on `OfficeStatisticsRow` or `DailyExpenseRow`.
  - `statistics_service` did not read Office `Netto` or Daily `Ausgabe N Netto` columns.
- Fixed backend parsing and response models:
  - Office rows now include optional `netto` from the `Netto` column.
  - Daily Bar Ausgabe drilldown rows now include optional summed `netto` from `Ausgabe N Netto` columns.
  - Brutto-only statistics and pie chart totals remain unchanged.
- Updated OpenAPI v1 baseline for the additive optional `netto` fields.
- Verification passed:
  - `uv run pytest tests/test_statistics_service.py -q`
  - `uv run pytest tests/test_api_schema_v1.py::test_office_statistics_row_optional_fields tests/test_api_schema_v1.py::test_monthly_statistics_preview_endpoint -q`
  - `uv run pytest tests/test_statistics_service.py tests/test_api_schema_v1.py::test_office_statistics_row_optional_fields tests/test_api_schema_v1.py::test_monthly_statistics_preview_endpoint tests/test_api_schema_v1.py::test_openapi_contract_frozen_v1 -q`
  - `npm run test -- --run`
  - `npm run build`
- Playwright screenshot and metrics:
  - `frontend/test-results/statistics-hover-only-tooltip-netto.png`
  - `frontend/test-results/statistics-hover-only-tooltip-netto-metrics.json`
  - Metrics confirmed `selectedTooltipCountBeforeHover: 0`, hover tooltip appears, `tooltipTextFitsRect: true`, and Details contains Netto.
- Note: running the full `tests/test_api_schema_v1.py` file still exposes unrelated local backend test failures around `_safe_pdf_page_count` / skip markers that pre-existed this statistics change path and are outside `TC-109`.

## Tooltip Placement Simplification

- Moved the expense pie tooltip out of the SVG into a single HTML overlay above the pie.
- Tooltip now has `pointer-events: none`, so the tooltip box cannot steal pointer focus from the hovered slice.
- The tooltip still appears only on slice hover and disappears on slice mouseleave.
- Tightened tooltip line spacing with compact line-height and a small inter-line gap.
- Verification passed:
  - `npx vitest run src/features/statistics/components/StatisticsCharts.test.jsx src/features/statistics/pages/StatisticsPage.test.jsx`
  - `npm run build`
  - `npm run test -- --run`
- Playwright screenshot and metrics:
  - `frontend/test-results/statistics-tooltip-top-hover.png`
  - `frontend/test-results/statistics-tooltip-top-hover-metrics.json`
  - Metrics confirmed `tooltipPointerEvents: none`, `tooltipAbovePie: true`, compact `tooltipLineHeight`, and hover tooltip text is visible.

## Compact Tooltip Layout

- Reduced excessive vertical whitespace in `Ausgabenstruktur`:
  - Tooltip reserved space reduced from `4.6rem` to `1.25rem`.
  - Pie SVG viewBox changed from padded `-12 -12 204 204` to compact `0 0 180 180`.
  - Expense breakdown internal gap tightened.
  - Tooltip padding slightly reduced while keeping text readable.
- Verification passed:
  - `npx vitest run src/features/statistics/components/StatisticsCharts.test.jsx src/features/statistics/pages/StatisticsPage.test.jsx`
  - `npm run build`
- Playwright screenshot and layout metrics:
  - `frontend/test-results/statistics-tooltip-compact-layout.png`
  - `frontend/test-results/statistics-tooltip-compact-layout-metrics.json`
  - Metrics confirmed `tooltipPointerEvents: none`, tooltip text visible, `pieToListGap: 9`, and compact title-to-tooltip spacing.
- Process note: future screenshot checks should include layout reasonableness, not just functional presence.

## Status

- `TC-109` remains `PLANNED`.
- Executor should report readiness only. User approval is required before changing the task status to `DONE`.

## Manual Ausgabe Follow-up

- User approved extending `/statistics` with manual Ausgabe rows.
- Design decisions:
  - Initial type options are `Personalkosten` and `代付款`, persisted in `tests/config.json`.
  - Labels for these new controls stay as literal source text for now, not i18n keys.
  - Manual rows have `type`, `brutto`, and `netto`.
  - Brutto entry debounce-copies to Netto until Netto is manually edited.
  - Both `.` and `,` are accepted only as decimal separators; thousands separators are unsupported.
  - Backend detects case-insensitive duplicate manual types already present in Office Excel and returns a conflict unless the frontend retries with explicit confirmation.
- Implementation approach:
  - Write failing backend tests for manual row aggregation, duplicate conflict, and type config persistence.
  - Write failing frontend tests for add/delete/manual submission, new type creation, and duplicate-confirm retry.
  - Implement minimal backend and frontend changes, then run targeted tests before broader verification.
- Implemented:
  - Added `statistics_manual_expense_types` to `tests/config.json` with `Personalkosten` and `代付款`.
  - Added config-backed manual type GET/POST endpoints under `/v1/statistics/manual-expense-types`.
  - Extended monthly preview with `manual_expense_rows_json` and `allow_duplicate_manual_types`.
  - Added duplicate manual-vs-Office type conflict response (`409`, `DUPLICATE_MANUAL_EXPENSE_TYPES`) and frontend confirm/retry handling.
  - Added manual Ausgabe UI rows with type, Brutto, Netto, add/delete, create-new-type prompt, and Brutto-to-Netto debounce copy.
  - Fixed real-data DailyTrend duplicate date React key warnings found during browser verification.
- Verification passed:
  - `uv run pytest tests/test_statistics_service.py -q`
  - `uv run pytest tests/test_statistics_service.py tests/test_api_schema_v1.py::test_statistics_manual_expense_types_config_endpoints tests/test_api_schema_v1.py::test_monthly_statistics_preview_endpoint tests/test_api_schema_v1.py::test_monthly_statistics_preview_accepts_manual_expense_rows tests/test_api_schema_v1.py::test_monthly_statistics_preview_rejects_duplicate_manual_type_until_confirmed tests/test_api_schema_v1.py::test_openapi_contract_frozen_v1 -q`
  - `npx vitest run src/features/statistics/components/StatisticsCharts.test.jsx src/features/statistics/pages/StatisticsPage.test.jsx src/features/statistics/api/statisticsClient.real.test.js`
  - `npm run test -- --run`
  - `npm run build`
- Browser verification:
  - Existing `5173` frontend showed the manual input layout correctly, but its configured backend returned 404 for the new endpoint because that running backend was older.
  - Started current API on `http://127.0.0.1:8001` and current Vite on `http://127.0.0.1:5174` for real integration verification.
  - Uploaded `D:\CodeSpace\prj_rechnung\2511_Bar_Do.xlsx` and `D:\CodeSpace\prj_rechnung\2511_Office_KL.xlsx`, added `Personalkosten` manually, observed the duplicate confirm dialog, accepted merge, and generated KPI/results successfully.
  - Browser console after the duplicate flow only retained the expected first-request `409 Conflict` resource log plus existing React Router future warnings.

## Selected Tooltip And Real Excel Netto Validation

- Changed `Ausgabenstruktur` tooltip state so hover and selected states are both supported:
  - Hovering a slice shows that slice's category and Brutto amount.
  - Selecting a slice or category row keeps that category selected.
  - When the pointer leaves the pie, the tooltip falls back to the selected category.
  - Hovering another slice while a selection exists temporarily shows the hovered slice, then restores the selected slice after leaving.
- Reworked pie slice rendering from stroked circles to filled donut paths, so hover hit testing follows the actual visible slice region instead of the SVG stroke bounding area.
- Investigated empty Details Netto with the supplied files:
  - `D:\CodeSpace\prj_rechnung\2511_Bar_Do.xlsx`
  - `D:\CodeSpace\prj_rechnung\2511_Office_KL.xlsx`
- Root cause:
  - The Bar workbook uses lowercase `Ausgabe 1 netto`, while statistics parsing previously matched `Ausgabe N Netto` case-sensitively.
  - The Docker frontend had previously baked `frontend/.env.local` into the image, causing the 8002 frontend to call an older `127.0.0.1:8000` API.
- Fixes:
  - Daily Netto column matching is now case-insensitive for `Ausgabe N Netto`.
  - No `Ausgabe Sum Netto` fallback is used for statistics; if `Ausgabe N Netto` columns are absent while Bar Ausgabe Brutto values exist, the service emits a warning instead of deriving from the sum column.
  - `.dockerignore` excludes `frontend/.env.local`, so Docker frontend uses the container-served same-origin API after rebuild.
- Verification passed:
  - `uv run pytest tests/test_statistics_service.py -q`
  - `npx vitest run src/features/statistics/components/StatisticsCharts.test.jsx src/features/statistics/pages/StatisticsPage.test.jsx`
  - `npm run build`
  - `docker compose up -d --build`
- Playwright screenshot and layout/state metrics:
  - `frontend/test-results/statistics-docker-real-files-final-tooltip-netto.png`
  - `frontend/test-results/statistics-docker-real-files-final-tooltip-netto-metrics.json`
  - Metrics confirmed tooltip hover override, selected tooltip restoration, `pointer-events: none`, compact `pieToListGap: 9`, and non-empty Details Netto for RamenIppin Europa.
