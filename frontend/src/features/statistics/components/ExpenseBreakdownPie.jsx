import { useMemo, useState } from "react";

const COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f"];

const currency = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

/**
 * Expense structure chart with Bar Ausgabe and Office type drilldown.
 * @param {{ breakdown: Array; dailyRows: Array; officeRows: Array; labels?: Record<string, string> }} props
 */
export function ExpenseBreakdownPie({ breakdown = [], dailyRows = [], officeRows = [], labels = {} }) {
  const items = breakdown.filter((item) => Number(item.brutto) !== 0);
  const [selectedCategory, setSelectedCategory] = useState(items[0]?.category || "");
  const selected = items.find((item) => item.category === selectedCategory) || items[0] || null;
  const slices = useMemo(() => buildSlices(items), [items]);

  if (!items.length) {
    return <p className="statistics-empty">No expenses found.</p>;
  }

  const drilldownRows =
    selected?.source === "daily_bar"
      ? dailyRows.map((row) => ({ date: row.date, name: "Bar Ausgabe", brutto: row.brutto }))
      : officeRows.filter((row) => row.type === selected?.category);

  return (
    <div className="statistics-expense-breakdown">
      <svg className="statistics-pie" viewBox="0 0 180 180" role="img" aria-label="Expense breakdown pie chart">
        <circle cx="90" cy="90" r="58" className="statistics-pie-base" />
        {slices.map((slice) => (
          <circle
            key={slice.category}
            cx="90"
            cy="90"
            r="58"
            className="statistics-pie-slice"
            stroke={slice.color}
            strokeDasharray={`${slice.length} ${slice.gap}`}
            strokeDashoffset={slice.offset}
            onClick={() => setSelectedCategory(slice.category)}
          />
        ))}
        <text x="90" y="85" textAnchor="middle" className="statistics-pie-kicker">
          {labels.spend || "Spend"}
        </text>
        <text x="90" y="104" textAnchor="middle" className="statistics-pie-total">
          {currency.format(items.reduce((sum, item) => sum + Number(item.brutto || 0), 0))}
        </text>
      </svg>

      <div className="statistics-expense-list">
        {items.map((item, index) => (
          <button
            key={`${item.source}-${item.category}`}
            type="button"
            className={`statistics-expense-item ${selected?.category === item.category ? "selected" : ""}`}
            onClick={() => setSelectedCategory(item.category)}
          >
            <span className="statistics-expense-swatch" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
            <span className="statistics-expense-name">{item.category}</span>
            <span className="statistics-expense-share">{formatShare(item.share)}</span>
            <span className="statistics-expense-amount">{currency.format(item.brutto || 0)}</span>
          </button>
        ))}
      </div>

      <div className="statistics-table-stack" data-testid="expense-drilldown">
        <table className="statistics-table detail">
          <thead>
            <tr>
              <th>{labels.date || "Date"}</th>
              <th>{labels.name || "Name"}</th>
              <th className="text-right">Brutto</th>
            </tr>
          </thead>
          <tbody>
            {drilldownRows.map((row, index) => (
              <tr key={`${selected?.category}-${row.date || "none"}-${row.name || index}-${index}`}>
                <td>{row.date || "-"}</td>
                <td>{row.name || selected?.category || "-"}</td>
                <td className="text-right">{currency.format(row.brutto || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function buildSlices(items) {
  const total = items.reduce((sum, item) => sum + Math.max(Number(item.brutto || 0), 0), 0);
  const circumference = 2 * Math.PI * 58;
  let offset = 0;

  return items.map((item, index) => {
    const length = total > 0 ? (Math.max(Number(item.brutto || 0), 0) / total) * circumference : 0;
    const slice = {
      category: item.category,
      color: COLORS[index % COLORS.length],
      length,
      gap: Math.max(circumference - length, 0),
      offset: -offset,
    };
    offset += length;
    return slice;
  });
}

function formatShare(value) {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}
