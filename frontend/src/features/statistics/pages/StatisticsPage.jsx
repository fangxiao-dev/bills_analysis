import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppFrame } from "../../../app/AppFrame";
import { AlertBanner } from "../../../shared/ui/AlertBanner";
import { Button } from "../../../shared/ui/Button";
import { previewMonthlyStatistics } from "../api/statisticsClient";
import { DailyTrendChart } from "../components/DailyTrendChart";
import { KpiStrip } from "../components/KpiStrip";
import { OfficeTypeBreakdown } from "../components/OfficeTypeBreakdown";
import { ProfitBridgeChart } from "../components/ProfitBridgeChart";

/**
 * Monthly statistics dashboard driven by two uploaded Excel files.
 */
export function StatisticsPage() {
  const { t } = useTranslation();
  const [dailyFile, setDailyFile] = useState(null);
  const [officeFile, setOfficeFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const canGenerate = Boolean(dailyFile && officeFile) && !loading;

  async function handleGenerate() {
    if (!canGenerate) {
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await previewMonthlyStatistics({ dailyExcel: dailyFile, officeExcel: officeFile });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("statistics.errorFallback"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppFrame>
      <div data-testid="statistics-page">
        <header className="app-topbar section-enter">
          <div>
            <h1>{t("statistics.title")}</h1>
            <p>{t("statistics.subtitle")}</p>
          </div>
          <div className="topbar-meta">
            <span className="topbar-chip success">{t("statistics.mode")}</span>
          </div>
        </header>

        <section className="ledger-shell">
          <section className="ledger-card section-enter p-4">
            <div className="statistics-upload-grid">
              <label className="statistics-file-input">
                <span>{t("statistics.dailyLabel")}</span>
                <input
                  data-testid="file-input-daily"
                  type="file"
                  accept=".xlsx,.xlsm"
                  onChange={(event) => setDailyFile(event.target.files?.[0] || null)}
                />
                <small>{dailyFile ? dailyFile.name : t("statistics.noFile")}</small>
              </label>
              <label className="statistics-file-input">
                <span>{t("statistics.officeLabel")}</span>
                <input
                  data-testid="file-input-office"
                  type="file"
                  accept=".xlsx,.xlsm"
                  onChange={(event) => setOfficeFile(event.target.files?.[0] || null)}
                />
                <small>{officeFile ? officeFile.name : t("statistics.noFile")}</small>
              </label>
              <div className="statistics-action-cell">
                <Button type="button" onClick={() => void handleGenerate()} disabled={!canGenerate} data-testid="generate-button">
                  {loading ? t("statistics.generating") : t("statistics.generate")}
                </Button>
              </div>
            </div>
            {error ? (
              <div className="mt-3">
                <AlertBanner tone="error" message={error} />
              </div>
            ) : null}
          </section>
        </section>

        {result ? (
          <section className="ledger-shell statistics-results">
            <KpiStrip summary={result.summary} />

            <section className="statistics-grid">
              <article className="ledger-card section-enter p-4">
                <h2 className="statistics-section-title">{t("statistics.profitBridge")}</h2>
                <ProfitBridgeChart summary={result.summary} />
              </article>
              <article className="ledger-card section-enter p-4">
                <h2 className="statistics-section-title">{t("statistics.dailyTrend")}</h2>
                <DailyTrendChart series={result.daily_series || []} />
              </article>
            </section>

            <section className="ledger-card section-enter p-4">
              <h2 className="statistics-section-title">{t("statistics.officeBreakdown")}</h2>
              <OfficeTypeBreakdown byType={result.office_by_type || []} rows={result.office_rows || []} />
            </section>

            {result.warnings?.length ? (
              <section className="ledger-card section-enter p-4">
                <h2 className="statistics-section-title">{t("statistics.warnings")}</h2>
                <ul className="statistics-warnings">
                  {result.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        ) : null}
      </div>
    </AppFrame>
  );
}
