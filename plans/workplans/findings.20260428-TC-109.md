# Findings For TC-109

## Playwright Screenshot Findings

- Upload-before-result desktop state returns `200`, but leaves most of the page blank below the upload card.
- Mobile navigation consumes about 238px before the statistics content starts.
- Result desktop state after waiting for animations:
  - KPI row is readable.
  - Profit bridge and expense breakdown are visible.
  - Daily trend is large.
  - Details starts around y=1170.
- Result mobile state:
  - Details starts around y=2094.
  - Users must scroll through navigation, upload controls, KPI cards, and charts before seeing Details.

## Technical Findings

- `ExpenseDetailTable` currently chooses rows by selected breakdown item:
  - `daily_bar`: maps `daily_expense_rows` to "Bar Ausgabe" rows.
  - `office`: filters `office_rows` by selected type.
- `selectedExpenseCategory` defaults to `data.expense_breakdown?.[0]?.category`, so Details defaults to one category, not all expenses.
- Backend `daily_expense_rows` are daily aggregates, not per-receipt Bar Ausgabe rows. Showing each individual Bar Ausgabe would need an additive API field in a separate follow-up.

## Technical Decisions

- Use a frontend-only fix first: normalize all available detail rows in the UI and add an all-categories filter.
- Preserve the existing v1 API contract.
- Keep tests focused on user-visible behavior in `StatisticsPage.test.jsx`.
