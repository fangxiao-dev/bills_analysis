import { useMemo, useState } from "react";

const COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f"];

const currency = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/**
 * Expense structure chart with Bar Ausgabe and Office type drilldown.
 * @param {{ breakdown: Array; selectedCategory?: string; onSelectCategory?: (category: string) => void; labels?: Record<string, string> }} props
 */
export function ExpenseBreakdownPie({ breakdown = [], selectedCategory = "", onSelectCategory, labels = {} }) {
  const [hoveredCategory, setHoveredCategory] = useState("");
  const items = breakdown.filter((item) => Number(item.brutto) !== 0);
  const selected = items.find((item) => item.category === selectedCategory) || null;
  const hovered = items.find((item) => item.category === hoveredCategory) || null;
  const displayItem = hovered || selected;
  const slices = useMemo(() => buildSlices(items), [items]);
  const total = items.reduce((sum, item) => sum + Number(item.brutto || 0), 0);

  if (!items.length) {
    return <p className="statistics-empty">No expenses found.</p>;
  }

  return (
    <div className={`statistics-expense-breakdown ${items.length >= 9 ? "many" : "few"}`}>
      <div className="statistics-pie-stage">
        {displayItem ? (
          <div data-testid="expense-pie-tooltip" className="statistics-pie-tooltip" aria-hidden="true">
            <span>{displayItem.category}</span>
            <span>{currency.format(displayItem.brutto || 0)}</span>
          </div>
        ) : null}
        <svg className="statistics-pie" viewBox="0 0 180 180" role="img" aria-label="Expense breakdown pie chart">
          <circle cx="90" cy="90" r="58" className="statistics-pie-base" />
          {slices.map((slice) => (
            <g key={slice.category} transform={slice.category === selectedCategory ? `translate(${slice.dx} ${slice.dy})` : "translate(0 0)"}>
              <path
                data-testid={`expense-slice-${slice.category}`}
                d={slice.path}
                className={`statistics-pie-slice ${slice.category === selectedCategory ? "selected" : ""}`}
                fill={slice.color}
                onMouseEnter={() => setHoveredCategory(slice.category)}
                onMouseLeave={() => setHoveredCategory("")}
                onClick={() => {
                  setHoveredCategory("");
                  onSelectCategory?.(slice.category);
                }}
              />
            </g>
          ))}
          <text x="90" y="85" textAnchor="middle" className="statistics-pie-kicker">
            {labels.spend || "Spend"}
          </text>
          <text x="90" y="104" textAnchor="middle" className="statistics-pie-total">
            {currency.format(total)}
          </text>
        </svg>
      </div>

      <div className="statistics-expense-list">
        <button
          type="button"
          className={`statistics-expense-item summary ${selectedCategory ? "" : "selected"}`}
          onClick={() => {
            setHoveredCategory("");
            onSelectCategory?.("");
          }}
        >
          <span className="statistics-expense-swatch all" />
          <span className="statistics-expense-name">{labels.allExpenses || "All expenses"}</span>
          <span className="statistics-expense-share">100.0%</span>
          <span className="statistics-expense-amount">{currency.format(total)}</span>
        </button>
        {items.map((item, index) => (
          <button
            key={`${item.source}-${item.category}`}
            type="button"
            className={`statistics-expense-item ${selected?.category === item.category ? "selected" : ""}`}
            onClick={() => {
              setHoveredCategory("");
              onSelectCategory?.(item.category);
            }}
          >
            <span className="statistics-expense-swatch" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
            <span className="statistics-expense-name">{item.category}</span>
            <span className="statistics-expense-share">{formatShare(item.share)}</span>
            <span className="statistics-expense-amount">{currency.format(item.brutto || 0)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function buildSlices(items) {
  const total = items.reduce((sum, item) => sum + Math.max(Number(item.brutto || 0), 0), 0);
  let angle = -Math.PI / 2;

  return items.map((item, index) => {
    const sweep = total > 0 ? (Math.max(Number(item.brutto || 0), 0) / total) * Math.PI * 2 : 0;
    const startAngle = angle;
    const endAngle = angle + sweep;
    const midAngle = startAngle + sweep / 2;
    const slice = {
      category: item.category,
      color: COLORS[index % COLORS.length],
      path: donutSlicePath(90, 90, 46, 70, startAngle, endAngle),
      dx: Number((Math.cos(midAngle) * 8).toFixed(2)),
      dy: Number((Math.sin(midAngle) * 8).toFixed(2)),
    };
    angle = endAngle;
    return slice;
  });
}

function donutSlicePath(cx, cy, innerRadius, outerRadius, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = polarPoint(cx, cy, outerRadius, startAngle);
  const outerEnd = polarPoint(cx, cy, outerRadius, endAngle);
  const innerEnd = polarPoint(cx, cy, innerRadius, endAngle);
  const innerStart = polarPoint(cx, cy, innerRadius, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function polarPoint(cx, cy, radius, angle) {
  return {
    x: Number((cx + Math.cos(angle) * radius).toFixed(3)),
    y: Number((cy + Math.sin(angle) * radius).toFixed(3)),
  };
}

function formatShare(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}
