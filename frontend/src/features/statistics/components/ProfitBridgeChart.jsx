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
    { label: "Revenue", value: summary.revenue_brutto, tone: "revenue" },
    { label: "Daily", value: summary.daily_expense_brutto, tone: "expense" },
    { label: "Office", value: summary.office_expense_brutto, tone: "expense" },
    { label: "Profit", value: summary.profit_brutto, tone: "profit" },
  ];
  const maxAbs = Math.max(...bars.map((bar) => Math.abs(bar.value || 0)), 1);
  const chartHeight = 158;
  const chartTop = 28;
  const barWidth = 62;
  const gap = 24;
  const totalWidth = bars.length * barWidth + (bars.length + 1) * gap;
  const baselineY = chartTop + chartHeight / 2;
  const chartBottom = chartTop + chartHeight;
  const labelY = chartBottom + 30;

  return (
    <svg className="statistics-chart" viewBox={`0 0 ${totalWidth} 238`} role="img" aria-label="Revenue and expense comparison">
      <line data-testid="profit-bridge-baseline" x1="12" x2={totalWidth - 12} y1={baselineY} y2={baselineY} className="statistics-axis" />
      {bars.map((bar, index) => {
        const value = bar.value || 0;
        const height = Math.max((Math.abs(value) / maxAbs) * (chartHeight / 2), 3);
        const x = gap + index * (barWidth + gap);
        const y = value < 0 ? baselineY : baselineY - height;
        const labelId = bar.label.toLowerCase();
        return (
          <g key={bar.label}>
            <rect
              data-testid={`profit-bridge-bar-${labelId}`}
              data-label={labelId}
              className={`statistics-bar ${bar.tone}`}
              x={x}
              y={y}
              width={barWidth}
              height={height}
              rx="4"
            />
            <rect data-testid="profit-bridge-bar" data-label={labelId} className="statistics-bar-hitbox" x={x} y={y} width={barWidth} height={height} />
            <text data-testid={`profit-bridge-value-${labelId}`} className="statistics-bar-value" x={x + barWidth / 2} y={y - 8} textAnchor="middle">
              {compactCurrency.format(value)}
            </text>
            <text className="statistics-bar-label" x={x + barWidth / 2} y={labelY} textAnchor="middle">
              {bar.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
