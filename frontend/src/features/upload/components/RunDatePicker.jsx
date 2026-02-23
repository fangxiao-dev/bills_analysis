import { useMemo } from "react";
import { useTranslation } from "react-i18next";

/**
 * Inline run-date picker using native calendar selection.
 * @param {{
 *  value: string;
 *  onChange: (nextValue: string) => void;
 * }} props
 */
export function RunDatePicker({ value, onChange }) {
  const { t } = useTranslation();
  const isoValue = useMemo(() => toIsoDate(value), [value]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ledger-ink">{t("upload.runDate")}</span>
      <input
        type="date"
        inputMode="none"
        className="w-full rounded border border-ledger-line bg-white px-2 py-2 text-sm text-ledger-ink"
        value={isoValue}
        onKeyDown={preventTypedDateEntry}
        onChange={(event) => {
          onChange(fromIsoDate(event.target.value));
        }}
      />
      <span className="text-xs text-ledger-smoke">{t("upload.runDateHint")}</span>
    </div>
  );
}

/**
 * Prevent free typing so date comes from calendar selection.
 * @param {import("react").KeyboardEvent<HTMLInputElement>} event
 */
function preventTypedDateEntry(event) {
  const allowedKeys = new Set(["Tab", "Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", "Escape"]);
  if (!allowedKeys.has(event.key)) {
    event.preventDefault();
  }
}

/**
 * Convert DD/MM/YYYY to YYYY-MM-DD for native date input.
 * @param {string} runDate
 */
function toIsoDate(runDate) {
  const parts = runDate.split("/");
  if (parts.length !== 3) {
    return "";
  }
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) {
    return "";
  }
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Convert YYYY-MM-DD to DD/MM/YYYY.
 * @param {string} iso
 */
function fromIsoDate(iso) {
  const parts = iso.split("-");
  if (parts.length !== 3) {
    return "";
  }
  const [yyyy, mm, dd] = parts;
  return `${dd}/${mm}/${yyyy}`;
}

