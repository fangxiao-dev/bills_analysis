/**
 * Shared threshold for low-confidence extraction fields.
 */
export const DEFAULT_REVIEW_THRESHOLD = 0.5;

/**
 * Determine whether one editable field has an empty-like value.
 * @param {unknown} value
 */
export function isEmptyLikeValue(value) {
  if (value == null) {
    return true;
  }
  const text = String(value).trim();
  return !text || text === "-";
}

/**
 * Determine whether one editable field is a check/boolean field.
 * @param {string} fieldKey
 */
export function isCheckField(fieldKey) {
  const key = String(fieldKey || "").toLowerCase();
  return key === "receiver_ok" || key.endsWith("_ok") || key.startsWith("is_");
}

/**
 * Parse boolean-like text used in review inputs.
 * @param {unknown} value
 */
export function parseBooleanLike(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "-") {
    return null;
  }
  if (["true", "yes", "1", "ok"].includes(text)) {
    return true;
  }
  if (["false", "no", "0"].includes(text)) {
    return false;
  }
  return null;
}

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
 * Check whether one field should be highlighted:
 * - low confidence
 * - empty value
 * - check field explicitly false
 * @param {Record<string, unknown>} row
 * @param {string} fieldKey
 * @param {number} [threshold]
 */
export function isProblemField(row, fieldKey, threshold = DEFAULT_REVIEW_THRESHOLD) {
  const value = row?.[fieldKey];
  if (isEmptyLikeValue(value)) {
    return true;
  }
  if (isCheckField(fieldKey) && parseBooleanLike(value) === false) {
    return true;
  }
  return isLowConfidenceField(row, fieldKey, threshold);
}
