import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../../shared/ui/Button";
import { useTranslation } from "react-i18next";
import { buildUserFriendlySkipReason } from "../utils/skipReasonUtils";

/**
 * File queue rendered as high-density table for business workflows.
 * Shows per-file backend parsing status when batch inputs are available.
 * Shows page-limit warning icon when skip_reason is available from review rows.
 * @param {{
 *  files: Array<{ id: string; file?: File; name: string; size: number; category: "bar" | "zbon" | "office" | null }>;
 *  onRemove: (id: string) => void;
 *  batchInputs?: Array<{ path: string; category?: string | null; status?: string | null; error?: unknown }>;
 *  skipReasonByName?: Map<string, string>;
 * }} props
 */
export function FileQueuePanel({ files, onRemove, batchInputs, skipReasonByName }) {
  const { t } = useTranslation();
  const hasBatchInputs = Array.isArray(batchInputs) && batchInputs.length > 0;
  const [statusPopover, setStatusPopover] = useState(null);

  // Object URL cache for in-browser PDF preview; cleaned up on unmount.
  const previewCacheRef = useRef(new Map());
  useEffect(
    () => () => {
      for (const url of previewCacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      previewCacheRef.current.clear();
    },
    [],
  );

  // Close popover on outside click, scroll, or resize.
  useEffect(() => {
    if (!statusPopover) {
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
      setStatusPopover(null);
    };
    const onViewportChange = () => setStatusPopover(null);
    document.addEventListener("click", onDocumentClick);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [statusPopover]);

  if (!files.length) {
    return <p className="text-sm text-ledger-smoke">{t("upload.queueEmpty")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-ledger-line bg-white">
      <table className="queue-table">
        <thead>
          <tr>
            <th>{t("upload.queue.file")}</th>
            <th>{t("upload.queue.category")}</th>
            <th>{t("upload.queue.size")}</th>
            <th>{t("upload.queue.status")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {files.map((entry) => {
            const inputStatus = hasBatchInputs ? resolveInputStatus(entry, batchInputs) : "pending";
            const inputError = hasBatchInputs ? resolveInputError(entry, batchInputs) : null;
            const skipReason = resolveSkipReason(entry, skipReasonByName);
            // Override status to "skipped" when skip_reason is known, so the badge
            // reflects the page-limit skip rather than showing a misleading "extracted".
            const displayStatus = skipReason ? "skipped" : inputStatus;
            const failedReason =
              !skipReason && displayStatus === "failed" && typeof inputError === "string" && inputError.trim()
                ? inputError.trim()
                : null;
            const skippedStatusFallback = !skipReason && displayStatus === "skipped" ? t("upload.queue.skipReasonFallback") : null;
            const warningMessage = skipReason
              ? buildUserFriendlySkipReason(t, skipReason, "upload")
              : skippedStatusFallback || failedReason;
            const isSkipWarning = Boolean(skipReason) || displayStatus === "skipped";
            return (
              <tr key={entry.id} className="file-row">
                <td className="font-medium text-ledger-ink">{entry.name}</td>
                <td>
                  <span className={`category-chip ${entry.category || "unknown"}`}>
                    {entry.category ?? "unknown"}
                  </span>
                </td>
                <td className="text-ledger-smoke">{formatBytes(entry.size)}</td>
                <td>
                  <ItemStatusBadge status={displayStatus} t={t} />
                </td>
                <td>
                  <div className="flex items-center gap-2 flex-wrap">
                    {warningMessage ? (
                      <button
                        type="button"
                        className="review-skip-icon-btn"
                        aria-label={isSkipWarning ? t("review.skipReasonAria") : t("upload.queue.failedReasonAria")}
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
                          setStatusPopover((prev) =>
                            prev?.entryId === entry.id
                              ? null
                              : { entryId: entry.id, top, left, message: warningMessage || t("upload.queue.failedReasonFallback") },
                          );
                        }}
                      >
                        ⚠
                      </button>
                    ) : null}
                    {entry.file ? (
                      <a
                        href="#"
                        className="review-view-link"
                        title={t("review.openInNewTab")}
                        onClick={(event) => {
                          event.preventDefault();
                          let url = previewCacheRef.current.get(entry.id);
                          if (!url) {
                            url = URL.createObjectURL(entry.file);
                            previewCacheRef.current.set(entry.id, url);
                          }
                          window.open(url, "_blank", "noopener,noreferrer");
                        }}
                      >
                        {t("review.table.view")}
                      </a>
                    ) : null}
                    <Button type="button" variant="danger" className="px-2 py-1 text-xs" onClick={() => onRemove(entry.id)}>
                      {t("common.remove")}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {statusPopover
        ? createPortal(
            <div
              className="review-skip-popover"
              style={{ top: `${statusPopover.top}px`, left: `${statusPopover.left}px` }}
            >
              {statusPopover.message}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

/** @type {Record<string, { className: string; icon: string }>} */
const STATUS_STYLES = {
  pending: { className: "text-ledger-smoke", icon: "" },
  queued: { className: "text-ledger-smoke", icon: "\u25CB" },
  processing: { className: "text-blue-600", icon: "\u25D4" },
  extracted: { className: "text-green-600", icon: "\u2713" },
  skipped: { className: "text-amber-600", icon: "\u26A0" },
  failed: { className: "text-amber-700", icon: "\u26A0" },
};

/**
 * Per-file status badge for backend parsing progress.
 * @param {{ status: string | null; t: (key: string) => string }} props
 */
function ItemStatusBadge({ status, t }) {
  const key = String(status || "").toLowerCase();
  const style = STATUS_STYLES[key];
  if (!style) {
    return <span className="text-sm text-ledger-smoke">--</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium ${style.className}`}>
      {style.icon ? <span>{style.icon}</span> : null}
      {t(`upload.queue.itemStatus.${key}`)}
    </span>
  );
}

/**
 * Match a local file entry to its backend input status by filename only.
 * @param {{ name: string }} entry
 * @param {Array<{ path: string; status?: string | null }>} batchInputs
 */
function resolveInputStatus(entry, batchInputs) {
  const byName = batchInputs.find((input) => normalizeQueueFilename(input.path) === entry.name);
  if (byName) {
    return byName.status || null;
  }
  return null;
}

/**
 * Match a local file entry to backend input error by filename only.
 * @param {{ name: string }} entry
 * @param {Array<{ path: string; error?: unknown }>} batchInputs
 */
function resolveInputError(entry, batchInputs) {
  const byName = batchInputs.find((input) => normalizeQueueFilename(input.path) === entry.name);
  if (byName) {
    return byName.error || null;
  }
  return null;
}

/**
 * Look up skip_reason for a file entry from the reviewRows-derived name map.
 * @param {{ name: string }} entry
 * @param {Map<string, string> | undefined} skipReasonByName
 */
function resolveSkipReason(entry, skipReasonByName) {
  return skipReasonByName?.get(entry.name) ?? null;
}

/**
 * Format bytes as readable KB/MB values.
 * @param {number} value
 */
function formatBytes(value) {
  if (value < 1024) {
    return `${value} B`;
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Normalize backend input path to queue filename for stable matching.
 * Handles windows separators and "01_" style indexed prefixes.
 * @param {unknown} rawPath
 */
function normalizeQueueFilename(rawPath) {
  const path = String(rawPath || "").replace(/\\/g, "/");
  const tail = path.split("/").pop() || "";
  return tail.replace(/^\d+_/, "").trim();
}
