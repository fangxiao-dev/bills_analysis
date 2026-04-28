const currency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/**
 * Horizontal strip showing the four dashboard totals.
 * @param {{ summary: { revenue_brutto: number; daily_expense_brutto: number; office_expense_brutto: number; profit_brutto: number } }} props
 */
export function KpiStrip({ summary }) {
  return (
    <section className="statistics-kpi-strip">
      <KpiTile testId="kpi-revenue" label="Revenue" value={summary.revenue_brutto} tone="revenue" />
      <KpiTile testId="kpi-daily-expense" label="Daily expense" value={summary.daily_expense_brutto} tone="expense" />
      <KpiTile testId="kpi-office-expense" label="Office expense" value={summary.office_expense_brutto} tone="expense" />
      <KpiTile testId="kpi-profit" label="Profit" value={summary.profit_brutto} tone={summary.profit_brutto >= 0 ? "profit" : "loss"} />
    </section>
  );
}

function KpiTile({ testId, label, value, tone }) {
  return (
    <article className={`statistics-kpi-tile ${tone}`} data-testid={testId}>
      <p className="statistics-kpi-label">{label}</p>
      <p className="statistics-kpi-value">{currency.format(value || 0)}</p>
    </article>
  );
}
