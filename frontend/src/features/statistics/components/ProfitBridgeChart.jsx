const compactCurrency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/**
 * Four-bar comparison chart for revenue, expense buckets, and profit.
 * @param {{ summary: { revenue_brutto: number; daily_expense_brutto: number; office_expense_brutto: number; profit_brutto: number } }} props
 */
export function ProfitBridgeChart({ summary }) {
  const bars = [
    { label: "Revenue", value: summary.revenue_brutto, tone: "income" },
    { label: "Daily", value: summary.daily_expense_brutto, tone: "expense" },
    { label: "Office", value: summary.office_expense_brutto, tone: "expense" },
    { label: "Profit", value: summary.profit_brutto, tone: summary.profit_brutto >= 0 ? "income" : "loss" },
  ];
  const maxAbs = Math.max(...bars.map((bar) => Math.abs(bar.value || 0)), 1);
  const chartHeight = 156;
  const barWidth = 62;
  const gap = 24;
  const totalWidth = bars.length * barWidth + (bars.length + 1) * gap;

  return (
    <svg className="statistics-chart" viewBox={`0 0 ${totalWidth} 210`} role="img" aria-label="Revenue and expense comparison">
      <line x1="12" x2={totalWidth - 12} y1={chartHeight + 8} y2={chartHeight + 8} className="statistics-axis" />
      {bars.map((bar, index) => {
        const height = Math.max((Math.abs(bar.value || 0) / maxAbs) * chartHeight, 3);
        const x = gap + index * (barWidth + gap);
        const y = chartHeight + 8 - height;
        return (
          <g key={bar.label}>
            <rect className={`statistics-bar ${bar.tone}`} x={x} y={y} width={barWidth} height={height} rx="4" />
            <text className="statistics-bar-value" x={x + barWidth / 2} y={Math.max(y - 7, 12)} textAnchor="middle">
              {compactCurrency.format(bar.value || 0)}
            </text>
            <text className="statistics-bar-label" x={x + barWidth / 2} y={chartHeight + 30} textAnchor="middle">
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
