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
  const [skipPopover, setSkipPopover] = useState(null);

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
          {files.map((entry, index) => {
            const inputStatus = hasBatchInputs ? resolveInputStatus(entry, index, batchInputs) : "pending";
            const skipReason = resolveSkipReason(entry, skipReasonByName);
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
                  <ItemStatusBadge status={inputStatus} t={t} />
                </td>
                <td>
                  {skipReason ? (
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
                          prev?.entryId === entry.id
                            ? null
                            : { entryId: entry.id, top, left, message: buildUserFriendlySkipReason(t, skipReason) },
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    </div>
  );
}

/** @type {Record<string, { className: string; icon: string }>} */
const STATUS_STYLES = {
  pending: { className: "text-ledger-smoke", icon: "\u2014" },
  queued: { className: "text-ledger-smoke", icon: "\u25CB" },
  processing: { className: "text-blue-600", icon: "\u25D4" },
  extracted: { className: "text-green-600", icon: "\u2713" },
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
      <span>{style.icon}</span>
      {t(`upload.queue.itemStatus.${key}`)}
    </span>
  );
}

/**
 * Match a local file entry to its backend input status by index or filename.
 * @param {{ name: string }} entry
 * @param {number} index
 * @param {Array<{ path: string; status?: string | null }>} batchInputs
 */
function resolveInputStatus(entry, index, batchInputs) {
  if (batchInputs[index]) {
    return batchInputs[index].status || null;
  }
  const byName = batchInputs.find((input) => {
    const tail = String(input.path || "").split("/").pop() || "";
    return tail === entry.name;
  });
  return byName?.status || null;
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
