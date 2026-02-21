import { useTranslation } from "react-i18next";

/**
 * Status badge tied to backend batch lifecycle values.
 * @param {{ status?: "queued" | "running" | "review_ready" | "merging" | "merged" | "failed" }} props
 */
export function StatusBadge({ status }) {
  const { t } = useTranslation();
  const value = status || "queued";

  const classesByState = {
    queued: "bg-slate-100 text-slate-700 border-slate-200",
    running: "bg-blue-100 text-blue-700 border-blue-200",
    review_ready: "bg-indigo-100 text-indigo-700 border-indigo-200",
    merging: "bg-cyan-100 text-cyan-700 border-cyan-200",
    merged: "bg-emerald-100 text-emerald-700 border-emerald-200",
    failed: "bg-red-100 text-red-700 border-red-200",
  };

  return <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${classesByState[value] || classesByState.queued}`}>{t(`status.${value}`)}</span>;
}
