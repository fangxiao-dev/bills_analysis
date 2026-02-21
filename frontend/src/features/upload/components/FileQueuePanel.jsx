import { Button } from "../../../shared/ui/Button";
import { useTranslation } from "react-i18next";

/**
 * File queue rendered as high-density table for business workflows.
 * Shows per-file backend parsing status when batch inputs are available.
 * @param {{
 *  files: Array<{ id: string; name: string; size: number; category: "bar" | "zbon" | "office" | null }>;
 *  onRemove: (id: string) => void;
 *  batchInputs?: Array<{ path: string; category?: string | null; status?: string | null; error?: unknown }>;
 * }} props
 */
export function FileQueuePanel({ files, onRemove, batchInputs }) {
  const { t } = useTranslation();
  const hasBatchInputs = Array.isArray(batchInputs) && batchInputs.length > 0;

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
                  <Button type="button" variant="danger" className="px-2 py-1 text-xs" onClick={() => onRemove(entry.id)}>
                    {t("common.remove")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
