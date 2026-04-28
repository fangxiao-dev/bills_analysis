import { useState } from "react";

const currency = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

/**
 * Office type breakdown with clickable rows for line-item details.
 * @param {{ byType: Array<{ type: string; brutto: number; count: number; share: number }>; rows: Array<{ date: string|null; type: string; name: string|null; brutto: number }> }} props
 */
export function OfficeTypeBreakdown({ byType, rows }) {
  const [selectedType, setSelectedType] = useState(null);
  const detailRows = selectedType ? rows.filter((row) => row.type === selectedType) : [];

  return (
    <div className="statistics-table-stack">
      <table className="statistics-table">
        <thead>
          <tr>
            <th>Type</th>
            <th className="text-right">Brutto</th>
            <th className="text-right">Count</th>
            <th className="text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {byType.map((row) => (
            <tr
              key={row.type}
              className={selectedType === row.type ? "selected" : ""}
              onClick={() => setSelectedType(selectedType === row.type ? null : row.type)}
            >
              <td>{row.type}</td>
              <td className="text-right">{currency.format(row.brutto || 0)}</td>
              <td className="text-right">{row.count}</td>
              <td className="text-right">{((row.share || 0) * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedType && detailRows.length ? (
        <table className="statistics-table detail">
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th className="text-right">Brutto</th>
            </tr>
          </thead>
          <tbody>
            {detailRows.map((row, index) => (
              <tr key={`${row.type}-${row.name || index}`}>
                <td>{row.date || "-"}</td>
                <td>{row.name || "-"}</td>
                <td className="text-right">{currency.format(row.brutto || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
