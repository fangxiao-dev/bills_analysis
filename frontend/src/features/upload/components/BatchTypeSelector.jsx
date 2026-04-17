import { Button } from "../../../shared/ui/Button";
import { useTranslation } from "react-i18next";

/**
 * Batch type switcher for Daily/Office workflow.
 * @param {{
 *  value: "daily" | "office";
 *  onChange: (value: "daily" | "office") => void;
 *  testId?: string;
 * }} props
 */
export function BatchTypeSelector({ value, onChange, testId }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-ledger-ink">{t("upload.batchType")}</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={value === "daily" ? "primary" : "ghost"}
          onClick={() => onChange("daily")}
          aria-pressed={value === "daily"}
          className="min-w-20"
          data-testid="batch-type-daily"
        >
          {t("upload.daily")}
        </Button>
        <Button
          type="button"
          variant={value === "office" ? "primary" : "ghost"}
          onClick={() => onChange("office")}
          aria-pressed={value === "office"}
          className="min-w-20"
          data-testid="batch-type-office"
        >
          {t("upload.office")}
        </Button>
      </div>
    </div>
  );
}
