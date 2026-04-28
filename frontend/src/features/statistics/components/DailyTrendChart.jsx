import { useState } from "react";

const currency = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/**
 * SVG line chart for daily revenue and daily expense.
 * @param {{ series: Array<{ date: string; revenue_brutto: number; daily_expense_brutto: number }> }} props
 */
export function DailyTrendChart({ series }) {
  const [hovered, setHovered] = useState(null);

  if (!series.length) {
    return <p className="text-sm text-ledger-smoke">No daily data.</p>;
  }

  const width = 620;
  const height = 180;
  const padX = 54;
  const padY = 16;
  const maxValue = Math.max(...series.flatMap((point) => [point.revenue_brutto, point.daily_expense_brutto]), 1);
  const xFor = (index) => padX + (index / Math.max(series.length - 1, 1)) * (width - padX * 2);
  const yFor = (value) => padY + (1 - value / maxValue) * (height - padY * 2);
  const pointsFor = (key) => series.map((point, index) => `${xFor(index)},${yFor(point[key] || 0)}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(series.length / 7));
  const yTicks = [maxValue, maxValue / 2, 0];

  const hoverPoint = hovered ? series[hovered.index] : null;
  const tooltipWidth = 190;
  const tooltipHeight = 46;
  const tooltipX = hovered ? clamp(xFor(hovered.index) - tooltipWidth / 2, 8, width - tooltipWidth - 8) : 0;
  const tooltipTargetY = hoverPoint ? yFor(hoverPoint[hovered.kind === "revenue" ? "revenue_brutto" : "daily_expense_brutto"]) : 0;
  const tooltipY = tooltipTargetY - tooltipHeight - 12 < 6 ? tooltipTargetY + 14 : tooltipTargetY - tooltipHeight - 12;

  return (
    <svg className="statistics-chart wide" viewBox={`0 0 ${width} ${height + 26}`} role="img" aria-label="Daily revenue and expense trend">
      <line data-testid="daily-trend-y-axis" x1={padX} x2={padX} y1={padY} y2={height - padY} className="statistics-axis" />
      <line x1={padX} x2={width - padX} y1={height - padY} y2={height - padY} className="statistics-axis" />
      {yTicks.map((value) => (
        <g key={value}>
          <line x1={padX - 4} x2={width - padX} y1={yFor(value)} y2={yFor(value)} className="statistics-gridline" />
          <text data-testid="daily-trend-y-label" x={padX - 8} y={yFor(value) + 4} textAnchor="end" className="statistics-axis-label">
            {formatAxisValue(value)}
          </text>
        </g>
      ))}
      <polyline points={pointsFor("revenue_brutto")} className="statistics-line income" />
      <polyline points={pointsFor("daily_expense_brutto")} className="statistics-line expense" />
      {series.map((point, index) => (
        <g key={`hover-${point.date || "none"}-${index}`}>
          <circle
            data-testid={`daily-trend-point-revenue-${index}`}
            cx={xFor(index)}
            cy={yFor(point.revenue_brutto || 0)}
            r="5"
            className="statistics-trend-point income"
            onMouseEnter={() => setHovered({ index, kind: "revenue" })}
            onMouseLeave={() => setHovered(null)}
          />
          <circle
            data-testid={`daily-trend-point-expense-${index}`}
            cx={xFor(index)}
            cy={yFor(point.daily_expense_brutto || 0)}
            r="5"
            className="statistics-trend-point expense"
            onMouseEnter={() => setHovered({ index, kind: "expense" })}
            onMouseLeave={() => setHovered(null)}
          />
        </g>
      ))}
      {hoverPoint ? (
        <g data-testid="daily-trend-tooltip" className="statistics-trend-tooltip">
          <rect data-testid="daily-trend-tooltip-rect" x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="6" />
          <text x={tooltipX + 14} y={tooltipY + 19}>
            {hoverPoint.date}
          </text>
          <text x={tooltipX + 14} y={tooltipY + 36}>
            {hovered.kind === "revenue" ? "Revenue" : "Daily"}: {currency.format(hoverPoint[hovered.kind === "revenue" ? "revenue_brutto" : "daily_expense_brutto"] || 0)}
          </text>
        </g>
      ) : null}
      {series.map((point, index) =>
        index % labelEvery === 0 ? (
          <text key={`label-${point.date || "none"}-${index}`} x={xFor(index)} y={height + 14} textAnchor="middle" className="statistics-bar-label">
            {(point.date || "").slice(5) || point.date}
          </text>
        ) : null,
      )}
    </svg>
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatAxisValue(value) {
  if (value >= 1000) {
    return `${Math.round(value / 1000)}k`;
  }
  return `${Math.round(value)}`;
}
