import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppFrame } from "../../../app/AppFrame";
import { AlertBanner } from "../../../shared/ui/AlertBanner";
import { Button } from "../../../shared/ui/Button";
import { createManualExpenseType, getManualExpenseTypes, previewMonthlyStatistics } from "../api/statisticsClient";
import { DailyTrendChart } from "../components/DailyTrendChart";
import { ExpenseBreakdownPie } from "../components/ExpenseBreakdownPie";
import { KpiStrip } from "../components/KpiStrip";
import { ProfitBridgeChart } from "../components/ProfitBridgeChart";

const CREATE_NEW_TYPE_VALUE = "__create_new_type__";
const DEFAULT_MANUAL_TYPES = ["Personalkosten", "代付款"];

/**
 * Monthly statistics dashboard driven by two uploaded Excel files.
 */
export function StatisticsPage() {
  const { t } = useTranslation();
  const [dailyFile, setDailyFile] = useState(null);
  const [officeFile, setOfficeFile] = useState(null);
  const [manualTypes, setManualTypes] = useState(DEFAULT_MANUAL_TYPES);
  const [manualRows, setManualRows] = useState([]);
  const [manualType, setManualType] = useState(DEFAULT_MANUAL_TYPES[0]);
  const [manualBrutto, setManualBrutto] = useState("");
  const [manualNetto, setManualNetto] = useState("");
  const [nettoTouched, setNettoTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [selectedExpenseCategory, setSelectedExpenseCategory] = useState("");
  const canGenerate = Boolean(dailyFile && officeFile) && !loading;

  useEffect(() => {
    let cancelled = false;
    getManualExpenseTypes()
      .then((payload) => {
        const nextTypes = normalizeManualTypes(payload?.types);
        if (cancelled) {
          return;
        }
        if (!sameStringList(manualTypes, nextTypes)) {
          setManualTypes(nextTypes);
        }
        if (!nextTypes.includes(manualType)) {
          setManualType(nextTypes[0]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setManualTypes(DEFAULT_MANUAL_TYPES);
          setManualType(DEFAULT_MANUAL_TYPES[0]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (nettoTouched || manualNetto === manualBrutto) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setManualNetto(manualBrutto);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [manualBrutto, manualNetto, nettoTouched]);

  async function handleGenerate() {
    if (!canGenerate) {
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await submitPreview(false);
      setResult(data);
      setSelectedExpenseCategory("");
    } catch (err) {
      if (isDuplicateManualTypeError(err)) {
        const duplicates = getDuplicateManualTypes(err);
        const shouldMerge = window.confirm(
          `Manual Ausgabe type already exists in Office Excel: ${duplicates.join(", ")}. Continue and merge?`,
        );
        if (shouldMerge) {
          try {
            const data = await submitPreview(true);
            setResult(data);
            setSelectedExpenseCategory("");
            return;
          } catch (retryErr) {
            setError(retryErr instanceof Error ? retryErr.message : t("statistics.errorFallback"));
          }
        }
        return;
      }
      setError(err instanceof Error ? err.message : t("statistics.errorFallback"));
    } finally {
      setLoading(false);
    }
  }

  function submitPreview(allowDuplicateManualTypes) {
    return previewMonthlyStatistics({
      dailyExcel: dailyFile,
      officeExcel: officeFile,
      manualExpenseRows: manualRows.map((row) => ({
        type: row.type,
        brutto: row.brutto,
        netto: row.netto,
      })),
      allowDuplicateManualTypes,
    });
  }

  function handleAddManualRow() {
    const brutto = parseManualAmount(manualBrutto);
    const netto = parseManualAmount(manualNetto);
    if (!manualType || brutto === null || netto === null) {
      setError("Manual Ausgabe needs type, brutto, and netto. Use comma or dot as decimal separator.");
      return;
    }
    setManualRows((rows) => [
      ...rows,
      {
        id: `${Date.now()}-${rows.length}`,
        type: manualType,
        brutto,
        netto,
        bruttoText: manualBrutto.trim(),
        nettoText: manualNetto.trim(),
      },
    ]);
    setError("");
    const currentIndex = manualTypes.indexOf(manualType);
    const nextType = manualTypes[currentIndex + 1] || manualTypes[0] || "";
    setManualType(nextType);
    setManualBrutto("");
    setManualNetto("");
    setNettoTouched(false);
  }

  function handleDeleteManualRow(indexToDelete) {
    setManualRows((rows) => rows.filter((_, index) => index !== indexToDelete));
  }

  async function handleManualTypeChange(nextValue) {
    if (nextValue !== CREATE_NEW_TYPE_VALUE) {
      setManualType(nextValue);
      return;
    }
    const createdType = window.prompt("create new type");
    const cleanType = createdType?.trim();
    if (!cleanType) {
      setManualType(manualType || manualTypes[0] || "");
      return;
    }
    try {
      const payload = await createManualExpenseType(cleanType);
      const nextTypes = normalizeManualTypes(payload?.types);
      setManualTypes(nextTypes);
      setManualType(cleanType);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("statistics.errorFallback"));
      setManualType(manualType || manualTypes[0] || "");
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
            <div className="statistics-manual-expenses">
              {manualRows.map((row, index) => (
                <div className="statistics-manual-row" data-testid={`manual-expense-row-${index}`} key={row.id}>
                  <span>{row.type}</span>
                  <span>{row.bruttoText}</span>
                  <span>{row.nettoText}</span>
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => handleDeleteManualRow(index)}
                    data-testid={`manual-expense-delete-${index}`}
                  >
                    Delete
                  </Button>
                </div>
              ))}
              <div className="statistics-manual-row add">
                <select
                  aria-label="Manual Ausgabe type"
                  value={manualType}
                  onChange={(event) => void handleManualTypeChange(event.target.value)}
                  data-testid="manual-expense-type-select"
                >
                  {manualTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                  <option value={CREATE_NEW_TYPE_VALUE}>create new type</option>
                </select>
                <input
                  aria-label="Manual Ausgabe brutto"
                  value={manualBrutto}
                  inputMode="decimal"
                  placeholder="brutto"
                  onChange={(event) => {
                    setManualBrutto(event.target.value);
                    if (!nettoTouched) {
                      setManualNetto(event.target.value);
                    }
                  }}
                  data-testid="manual-expense-brutto-input"
                />
                <input
                  aria-label="Manual Ausgabe netto"
                  value={manualNetto}
                  inputMode="decimal"
                  placeholder="netto"
                  onChange={(event) => {
                    setNettoTouched(true);
                    setManualNetto(event.target.value);
                  }}
                  data-testid="manual-expense-netto-input"
                />
                <Button type="button" onClick={handleAddManualRow} data-testid="manual-expense-add-button">
                  Add
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

            <section className="statistics-chart-grid" data-testid="statistics-first-row">
              <article className="ledger-card section-enter p-4">
                <h2 className="statistics-section-title">{t("statistics.profitBridge")}</h2>
                <ProfitBridgeChart summary={result.summary} />
              </article>
              <article className="ledger-card section-enter p-4" data-testid="statistics-daily-trend-row">
                <h2 className="statistics-section-title">{t("statistics.dailyTrend")}</h2>
                <DailyTrendChart series={result.daily_series || []} />
              </article>
            </section>

            <section className="ledger-card section-enter p-4 statistics-expense-master" data-testid="statistics-expense-detail-row">
              <div className="statistics-expense-master-side">
                <h2 className="statistics-section-title">{t("statistics.expenseBreakdown")}</h2>
                <ExpenseBreakdownPie
                  breakdown={result.expense_breakdown || []}
                  selectedCategory={selectedExpenseCategory}
                  onSelectCategory={setSelectedExpenseCategory}
                  labels={{
                    allExpenses: t("statistics.allExpenses"),
                    spend: t("statistics.spend"),
                  }}
                />
              </div>
              <div className="statistics-expense-master-main">
                <h2 className="statistics-section-title">{t("statistics.details")}</h2>
                <ExpenseDetailTable
                  selectedCategory={selectedExpenseCategory}
                  dailyRows={result.daily_expense_rows || []}
                  officeRows={result.office_rows || []}
                  labels={{
                    allExpenses: t("statistics.allExpenses"),
                    date: t("statistics.date"),
                    name: t("statistics.name"),
                    row: t("statistics.row"),
                    rows: t("statistics.rows"),
                    netto: t("statistics.netto"),
                    total: t("statistics.total"),
                    type: t("statistics.type"),
                  }}
                />
              </div>
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

const currency = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

function ExpenseDetailTable({ selectedCategory, dailyRows = [], officeRows = [], labels = {} }) {
  const allRows = [
    ...officeRows.map((row) => ({
      date: row.date,
      type: row.type,
      name: row.name || row.type,
      brutto: toMoneyNumber(row.brutto),
      netto: toMoneyNumber(row.netto),
    })),
    ...dailyRows.map((row) => ({
      date: row.date,
      type: "Bar Ausgabe",
      name: "Bar Ausgabe",
      brutto: toMoneyNumber(row.brutto),
      netto: toMoneyNumber(row.netto),
    })),
  ];
  const rows = selectedCategory ? allRows.filter((row) => row.type === selectedCategory) : allRows;
  const total = rows.reduce((sum, row) => sum + Number(row.brutto || 0), 0);
  const rowLabel = rows.length === 1 ? labels.row || "row" : labels.rows || "rows";
  const filterLabel = selectedCategory || labels.allExpenses || "All expenses";

  return (
    <div className="statistics-table-stack" data-testid="expense-drilldown">
      <div className="statistics-detail-summary">
        <strong>{filterLabel}</strong>
        <span>{`${rows.length} ${rowLabel}`}</span>
        <span>{`${labels.total || "Total"} ${currency.format(total)}`}</span>
      </div>
      <table className="statistics-table detail">
        <thead>
          <tr>
            <th>{labels.date || "Date"}</th>
            <th>{labels.type || "Type"}</th>
            <th>{labels.name || "Name"}</th>
            <th className="text-right">Brutto</th>
            <th className="text-right">{labels.netto || "Netto"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.type || "none"}-${row.date || "none"}-${row.name || index}-${index}`}>
              <td>{row.date || "-"}</td>
              <td>{row.type || "-"}</td>
              <td>{row.name || row.type || "-"}</td>
              <td className="text-right">{currency.format(row.brutto || 0)}</td>
              <td className="text-right">{typeof row.netto === "number" ? currency.format(row.netto) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function toMoneyNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed
    .replace(/\s/g, "")
    .replace("€", "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeManualTypes(types) {
  if (!Array.isArray(types)) {
    return DEFAULT_MANUAL_TYPES;
  }
  const seen = new Set();
  const normalized = [];
  for (const item of types) {
    const label = String(item || "").trim();
    const key = label.toLocaleLowerCase();
    if (label && !seen.has(key)) {
      seen.add(key);
      normalized.push(label);
    }
  }
  return normalized.length ? normalized : DEFAULT_MANUAL_TYPES;
}

function sameStringList(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function parseManualAmount(value) {
  const text = String(value || "").trim().replace(/\s/g, "");
  if (!text || (text.includes(".") && text.includes(","))) {
    return null;
  }
  if ((text.match(/\./g) || []).length > 1 || (text.match(/,/g) || []).length > 1) {
    return null;
  }
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function isDuplicateManualTypeError(error) {
  return error?.status === 409 && error?.details?.detail?.code === "DUPLICATE_MANUAL_EXPENSE_TYPES";
}

function getDuplicateManualTypes(error) {
  const duplicates = error?.details?.detail?.duplicate_types;
  return Array.isArray(duplicates) ? duplicates.map((item) => String(item)).filter(Boolean) : [];
}
