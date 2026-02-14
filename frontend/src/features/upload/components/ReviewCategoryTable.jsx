/**
 * Check if a field has low extraction confidence and needs manual review.
 * Uses the per-field score dict from backend; threshold aligned with backend default (0.5).
 */
function isLowConfidence(row, fieldKey) {
  const score = row.score;
  if (!score || typeof score !== "object") return false;
  const DEFAULT_THRESHOLD = 0.5;
  let val = score[fieldKey];
  // brutto/netto: if score is -1, fallback to total_tax score
  if ((fieldKey === "brutto" || fieldKey === "netto") && val === -1) {
    val = score["total_tax"];
  }
  if (val == null) return false;
  return val < DEFAULT_THRESHOLD;
}

/**
 * Editable review table for one category.
 * Low-confidence cells are highlighted with amber border to guide manual review.
 * @param {{
 *  title: string;
 *  description: string;
 *  rows: Array<Record<string, string>>;
 *  columns: Array<{ key: string; label: string; readOnly?: boolean }>;
 *  onChangeCell: (rowId: string, key: string, value: string) => void;
 *  onViewRow?: (row: Record<string, string>) => void;
 * }} props
 */
export function ReviewCategoryTable({ title, description, rows, columns, onChangeCell, onViewRow }) {
  if (!rows.length) {
    return null;
  }

  return (
    <section className="ledger-card p-4">
      <header className="mb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-ledger-smoke">{description}</p>
      </header>

      <div className="overflow-x-auto rounded-md border border-ledger-line bg-white">
        <table className="queue-table review-edit-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={`${row.id}-${column.key}`}>
                    {column.readOnly ? (
                      <span className="text-ledger-ink">{row[column.key]}</span>
                    ) : (
                      <input
                        type="text"
                        value={row[column.key] ?? ""}
                        onChange={(event) => onChangeCell(row.id, column.key, event.target.value)}
                        className={`review-cell-input${isLowConfidence(row, column.key) ? " review-cell-low-confidence" : ""}`}
                        aria-label={`${title}-${column.key}-${row.id}`}
                      />
                    )}
                  </td>
                ))}
                <td>
                  <a
                    href="#"
                    className="review-view-link"
                    onClick={(event) => {
                      event.preventDefault();
                      onViewRow?.(row);
                    }}
                  >
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
