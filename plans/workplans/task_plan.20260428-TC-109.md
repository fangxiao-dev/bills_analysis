# TC-109 Statistics Page Layout And Details Optimization

## Goal

Improve `http://127.0.0.1:5173/statistics` so the monthly statistics dashboard is easier to scan and Details no longer appears to contain only one selected category.

## Scope

- Update Details behavior to default to all expenses.
- Add explicit category filtering with row count and total amount.
- Combine expense breakdown and Details into one master-detail section.
- Rebalance desktop result layout so KPI, trend, and detail entry are visible earlier.
- Compress mobile layout enough that Details is reachable without excessive scrolling.
- Add manual Ausgabe rows to the statistics input area with type, Brutto, Netto, add/delete controls.
- Persist manual Ausgabe type options in `tests/config.json`.
- Detect case-insensitive duplicate manual types already present in the uploaded Office Excel before merging.

## Out Of Scope

- Breaking API contract changes.
- Backend schema changes unless needed as additive follow-up.
- Full redesign of global app navigation outside what is needed for statistics mobile usability.

## Implementation Phases

1. **Details behavior**
   - Status: complete.
   - Add tests proving Details defaults to all office rows plus daily Bar Ausgabe rows.
   - Add tests proving category selection filters rows and updates visible status text.
   - Implement row normalization and totals in `StatisticsPage.jsx`.

2. **Master-detail layout**
   - Status: complete.
   - Move the expense drilldown into the same section as `ExpenseBreakdownPie`.
   - Keep chart/list selection wired to the Details table.
   - Add an "All expenses" control.

3. **Desktop layout**
   - Status: complete.
   - Keep top upload card compact.
   - Place KPI cards first, then a trend-led result layout.
   - Put `ProfitBridge` and `DailyTrend` in a responsive chart row.

4. **Mobile layout**
   - Status: complete.
   - Reduce sidebar/header footprint at `max-width: 1060px`.
   - Make KPI cards two-column at phone width where possible.
   - Ensure Details appears materially earlier than the current ~2094px position.

5. **Verification**
   - Status: complete.
   - Run targeted statistics tests.
   - Run frontend test/build as appropriate.
   - Capture Playwright screenshots for desktop and mobile result states.

6. **Manual Ausgabe entries**
   - Status: complete.
   - Add `Personalkosten` and `代付款` as configured initial manual types.
   - Add config-backed type list read/create API endpoints.
   - Extend monthly preview to accept manual rows with `type`, `brutto`, and `netto`.
   - If a manual type already exists in Office Excel `Type` values case-insensitively, return a conflict unless the request explicitly confirms merge.
   - Render manual rows in the upload area; support add/delete, custom type creation, and duplicate-confirm retry.
   - Brutto and Netto inputs accept either `.` or `,` as the decimal separator, with no thousands separator support.
   - Debounce-copy Brutto to Netto until the user manually edits Netto.

## Acceptance Criteria

- Details initially shows all available expense rows.
- The UI clearly shows current filter, row count, and total amount.
- Clicking one expense category filters Details in-place.
- Desktop result page shows Details in the same visual module as expense breakdown.
- Mobile result page places Details substantially earlier than before and has no obvious text overlap.
- Manual Ausgabe rows can be added, deleted, and included in generated statistics.
- Manual Ausgabe types can be created and persist through the config-backed endpoint.
- Duplicate manual/Office types require explicit user confirmation before merging.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
