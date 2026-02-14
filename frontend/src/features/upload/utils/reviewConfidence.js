/**
 * Shared threshold for low-confidence extraction fields.
 */
export const DEFAULT_REVIEW_THRESHOLD = 0.5;

/**
 * Check whether one field in a review row should be flagged for manual review.
 * For brutto/netto, score -1 falls back to total_tax.
 * @param {Record<string, unknown>} row
 * @param {string} fieldKey
 * @param {number} [threshold]
 */
export function isLowConfidenceField(row, fieldKey, threshold = DEFAULT_REVIEW_THRESHOLD) {
  const score = row?.score;
  if (!score || typeof score !== "object") {
    return false;
  }

  let value = score[fieldKey];
  if ((fieldKey === "brutto" || fieldKey === "netto") && value === -1) {
    value = score.total_tax;
  }

  if (value == null) {
    return false;
  }
  return Number(value) < threshold;
}

/**
 * Check whether a row contains any editable field that needs manual review.
 * @param {Record<string, unknown>} row
 * @param {Array<{ key: string; readOnly?: boolean }>} columns
 * @param {number} [threshold]
 */
export function rowNeedsManualReview(row, columns, threshold = DEFAULT_REVIEW_THRESHOLD) {
  return columns.some((column) => !column.readOnly && isLowConfidenceField(row, column.key, threshold));
}
