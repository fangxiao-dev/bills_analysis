import { Button } from "../../../shared/ui/Button";
import { useTranslation } from "react-i18next";

/**
 * File queue rendered as high-density table for business workflows.
 * @param {{
 *  files: Array<{ id: string; name: string; size: number; category: "bar" | "zbon" | "office" | null }>;
 *  onRemove: (id: string) => void;
 * }} props
 */
export function FileQueuePanel({ files, onRemove }) {
  const { t } = useTranslation();

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
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {files.map((entry) => (
            <tr key={entry.id} className="file-row">
              <td className="font-medium text-ledger-ink">{entry.name}</td>
              <td>
                <span className={`category-chip ${entry.category || "unknown"}`}>
                  {entry.category ?? "unknown"}
                </span>
              </td>
              <td className="text-ledger-smoke">{formatBytes(entry.size)}</td>
              <td>
                <Button type="button" variant="danger" className="px-2 py-1 text-xs" onClick={() => onRemove(entry.id)}>
                  {t("common.remove")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
