import { useTranslation } from "react-i18next";
import { isProblemField } from "../utils/reviewConfidence";

/**
 * Editable review table for one category.
 * Low-confidence cells are highlighted with amber border to guide manual review.
 * @param {{
 *  title: string;
 *  description: string;
 *  rows: Array<Record<string, string>>;
 *  columns: Array<{ key: string; label: string; readOnly?: boolean; inputType?: "text" | "select"; options?: Array<string | { value: string; label?: string }> }>;
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
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={`${row.id}-${column.key}`}>
                    {column.readOnly ? (
                      <span className="text-ledger-ink">{row[column.key]}</span>
                    ) : column.inputType === "select" ? (
                      <select
                        value={row[column.key] ?? ""}
                        onChange={(event) => onChangeCell(row.id, column.key, event.target.value)}
                        className={`review-cell-input${isProblemField(row, column.key) ? " review-cell-low-confidence" : ""}`}
                        aria-label={`${title}-${column.key}-${row.id}`}
                      >
                        {buildSelectOptions(row[column.key], column.options).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={row[column.key] ?? ""}
                        onChange={(event) => onChangeCell(row.id, column.key, event.target.value)}
                        className={`review-cell-input${isProblemField(row, column.key) ? " review-cell-low-confidence" : ""}`}
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

/**
 * Build select options while preserving one existing non-standard value from backend payload.
 * @param {unknown} currentValue
 * @param {Array<string | { value: string; label?: string }> | undefined} options
 */
function buildSelectOptions(currentValue, options) {
  const normalized = (options || []).map((option) => {
    if (typeof option === "string") {
      return { value: option, label: option };
    }
    return { value: option.value, label: option.label || option.value };
  });
  const value = String(currentValue ?? "").trim();
  if (value && !normalized.some((item) => item.value === value)) {
    return [{ value, label: value }, ...normalized];
  }
  return normalized;
}
