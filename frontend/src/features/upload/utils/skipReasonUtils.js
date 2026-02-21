/**
 * Build user-facing skip message from backend skip_reason payload.
 * Matches patterns like "page_count=X > max_pages=Y" from local_backend processing.
 * @param {(key: string, options?: Record<string, unknown>) => string} t
 * @param {string} skipReason
 */
export function buildUserFriendlySkipReason(t, skipReason) {
  const text = String(skipReason || "");
  const match = text.match(/max_pages=(\d+)/);
  const limit = match?.[1];
  if (limit) {
    return t("review.skipReasonExceeded", { limit });
  }
  return t("review.skipReasonFallback");
}
