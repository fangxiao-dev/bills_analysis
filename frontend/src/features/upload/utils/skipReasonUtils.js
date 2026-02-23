/**
 * Build user-facing skip message from backend skip_reason payload.
 * Matches patterns like "page_count=X > max_pages=Y" from local_backend processing.
 * @param {(key: string, options?: Record<string, unknown>) => string} t
 * @param {string} skipReason
 * @param {"review" | "upload"} [context="review"] - "upload" uses keys with submit-first guidance
 */
export function buildUserFriendlySkipReason(t, skipReason, context = "review") {
  const text = String(skipReason || "");
  const match = text.match(/max_pages=(\d+)/);
  const limit = match?.[1];
  const ns = context === "upload" ? "upload.queue" : "review";
  if (limit) {
    return t(`${ns}.skipReasonExceeded`, { limit });
  }
  return t(`${ns}.skipReasonFallback`);
}
