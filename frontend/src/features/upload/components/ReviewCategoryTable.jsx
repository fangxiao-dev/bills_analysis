import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isProblemField } from "../utils/reviewConfidence";
import { buildUserFriendlySkipReason } from "../utils/skipReasonUtils";
import { Button } from "../../../shared/ui/Button";

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
 *  onRemoveRow?: (rowId: string) => void;
 * }} props
 */
export function ReviewCategoryTable({ title, description, rows, columns, onChangeCell, onViewRow, onRemoveRow }) {
  const { t } = useTranslation();
  const [skipPopover, setSkipPopover] = useState(null);

  useEffect(() => {
    if (!skipPopover) {
      return undefined;
    }
    const onDocumentClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".review-skip-icon-btn") || target.closest(".review-skip-popover")) {
        return;
      }
      setSkipPopover(null);
    };
    const onViewportChange = () => setSkipPopover(null);
    document.addEventListener("click", onDocumentClick);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [skipPopover]);

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
                        className={`review-cell-input${isCompactField(column.key) ? " review-cell-input-compact" : ""}${isProblemField(row, column.key) ? " review-cell-low-confidence" : ""}`}
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
                        className={`review-cell-input${isCompactField(column.key) ? " review-cell-input-compact" : ""}${isProblemField(row, column.key) ? " review-cell-low-confidence" : ""}`}
                        aria-label={`${title}-${column.key}-${row.id}`}
                      />
                    )}
                  </td>
                ))}
                <td>
                  {row.skip_reason ? (
                    <button
                      type="button"
                      className="review-skip-icon-btn"
                      aria-label={t("review.skipReasonAria")}
                      onClick={(event) => {
                        const triggerRect = event.currentTarget.getBoundingClientRect();
                        const floatingWidth = 280;
                        const estimatedHeight = 74;
                        const viewportPadding = 8;
                        const placeAbove = triggerRect.top >= estimatedHeight + 12;
                        const top = placeAbove ? triggerRect.top - estimatedHeight - 8 : triggerRect.bottom + 8;
                        const left = Math.min(
                          Math.max(viewportPadding, triggerRect.left - 8),
                          window.innerWidth - floatingWidth - viewportPadding,
                        );
                        setSkipPopover((prev) =>
                          prev?.rowId === row.id
                            ? null
                            : {
                                rowId: row.id,
                                top,
                                left,
                                message: buildUserFriendlySkipReason(t, row.skip_reason),
                              },
                        );
                      }}
                    >
                      ⚠
                    </button>
                  ) : null}
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
                  {onRemoveRow ? (
                    <Button
                      type="button"
                      variant="danger"
                      className="px-2 py-1 text-xs"
                      onClick={() => onRemoveRow(row.id)}
                    >
                      {t("common.remove")}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {skipPopover
        ? createPortal(
            <div
              className="review-skip-popover"
              style={{ top: `${skipPopover.top}px`, left: `${skipPopover.left}px` }}
            >
              {skipPopover.message}
            </div>,
            document.body,
          )
        : null}
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

/**
 * Return whether this field should use compact input width in review table.
 * @param {string} key
 */
function isCompactField(key) {
  return key === "brutto" || key === "netto" || key === "receiver_ok";
}

