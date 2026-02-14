import { useTranslation } from "react-i18next";
import { isLowConfidenceField, rowNeedsManualReview } from "../utils/reviewConfidence";

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
  const { t } = useTranslation();

  if (!rows.length) {
    return null;
  }

  return (
    <section className="ledger-card p-4">
      <header className="mb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-ledger-smoke">{description}</p>
      </header>

      <div className="overflow-x-auto rounded-md border border-ledger-line bg-white">
        <table className="queue-table review-edit-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={rowNeedsManualReview(row, columns) ? "review-row-needs-review" : ""}>
                {columns.map((column) => (
                  <td key={`${row.id}-${column.key}`}>
                    {column.readOnly ? (
                      <span className="text-ledger-ink">{row[column.key]}</span>
                    ) : (
                      <input
                        type="text"
                        value={row[column.key] ?? ""}
                        onChange={(event) => onChangeCell(row.id, column.key, event.target.value)}
                        className={`review-cell-input${isLowConfidenceField(row, column.key) ? " review-cell-low-confidence" : ""}`}
                        aria-label={`${title}-${column.key}-${row.id}`}
                      />
                    )}
                  </td>
                ))}
                <td>
                  <a
                    href="#"
                    className="review-view-link"
                    title={t("review.openInNewTab")}
                    onClick={(event) => {
                      event.preventDefault();
                      onViewRow?.(row);
                    }}
                  >
                    {t("review.table.view")}
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
