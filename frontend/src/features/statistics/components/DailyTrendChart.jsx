/**
 * SVG line chart for daily revenue and daily expense.
 * @param {{ series: Array<{ date: string; revenue_brutto: number; daily_expense_brutto: number }> }} props
 */
export function DailyTrendChart({ series }) {
  if (!series.length) {
    return <p className="text-sm text-ledger-smoke">No daily data.</p>;
  }

  const width = 620;
  const height = 180;
  const padX = 36;
  const padY = 16;
  const maxValue = Math.max(...series.flatMap((point) => [point.revenue_brutto, point.daily_expense_brutto]), 1);
  const xFor = (index) => padX + (index / Math.max(series.length - 1, 1)) * (width - padX * 2);
  const yFor = (value) => padY + (1 - value / maxValue) * (height - padY * 2);
  const pointsFor = (key) => series.map((point, index) => `${xFor(index)},${yFor(point[key] || 0)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));

  return (
    <svg className="statistics-chart wide" viewBox={`0 0 ${width} ${height + 26}`} role="img" aria-label="Daily revenue and expense trend">
      <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} className="statistics-axis" />
      <polyline points={pointsFor("revenue_brutto")} className="statistics-line income" />
      <polyline points={pointsFor("daily_expense_brutto")} className="statistics-line expense" />
      {series.map((point, index) =>
        index % labelEvery === 0 ? (
          <text key={point.date || index} x={xFor(index)} y={height + 14} textAnchor="middle" className="statistics-bar-label">
            {(point.date || "").slice(5) || point.date}
          </text>
        ) : null,
      )}
    </svg>
  );
}
