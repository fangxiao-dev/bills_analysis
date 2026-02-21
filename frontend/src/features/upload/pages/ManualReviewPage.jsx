import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { AppFrame } from "../../../app/AppFrame";
import { API_BASE_URL } from "../../../config/env";
import { AlertBanner } from "../../../shared/ui/AlertBanner";
import { Button } from "../../../shared/ui/Button";
import { StatusBadge } from "../components/StatusBadge";
import { ReviewCategoryTable } from "../components/ReviewCategoryTable";
import { useUploadFlowContext } from "../state/UploadFlowContext";

const DEFAULT_MONTHLY_EXCEL_PATH = "";
const SOURCE_LOCAL_FILE = "local_file";
const SOURCE_LARK_SHEET = "lark_sheet";
const OFFICE_TYPE_OPTIONS = [
  "asiatico",
  "Fuji",
  "JFC",
  "Ramenlppin Europa",
  "Lebensmittel&Bedarf",
  "Miete",
  "Strom&Gas&Internet",
  "Bar Ausgabe",
  "Personalkosten",
  "Gerät&Geschirr",
  "Reparatur",
  "Getränke",
  "Bank&SumUp&Linzen",
  "Service&Andere",
  "Unternehmen",
];

/**
 * Manual review page for editing row-level fields and controlling merge actions.
 */
export function ManualReviewPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { client, state, actions, flags } = useUploadFlowContext();
  const effectiveBatchType = state.batch?.type || state.batchType || "daily";

  const barColumns = useMemo(
    () => [
      { key: "filename", label: t("review.table.file"), readOnly: true },
      { key: "store_name", label: t("review.columns.store_name") },
      { key: "brutto", label: t("review.columns.brutto") },
      { key: "netto", label: t("review.columns.netto") },
      { key: "run_date", label: t("review.columns.run_date") },
    ],
    [t],
  );

  const zbonColumns = useMemo(
    () => [
      { key: "filename", label: t("review.table.file"), readOnly: true },
      { key: "brutto", label: t("review.columns.brutto") },
      { key: "netto", label: t("review.columns.netto") },
      { key: "run_date", label: t("review.columns.run_date") },
    ],
    [t],
  );

  const officeColumns = useMemo(
    () => [
      { key: "filename", label: t("review.table.file"), readOnly: true },
      { key: "type", label: t("review.columns.type"), inputType: "select", options: OFFICE_TYPE_OPTIONS },
      { key: "sender", label: t("review.columns.sender") },
      { key: "brutto", label: t("review.columns.brutto") },
      { key: "netto", label: t("review.columns.netto") },
      { key: "tax_id", label: t("review.columns.tax_id") },
      { key: "receiver_ok", label: t("review.columns.receiver_ok") },
    ],
    [t],
  );

  const [draft, setDraft] = useState(() => buildDraftRowsFromFiles(state.files, state.runDate, null));
  const [localError, setLocalError] = useState("");
  const [monthlyPathSource, setMonthlyPathSource] = useState(SOURCE_LOCAL_FILE);
  const [selectedLocalFileName, setSelectedLocalFileName] = useState(null);
  const [selectedLocalFile, setSelectedLocalFile] = useState(null);
  const [larkSheetLink, setLarkSheetLink] = useState("");
  const [mergeMode, setMergeMode] = useState("overwrite");
  const [monthlyPath, setMonthlyPath] = useState(state.mergeRequestPayload?.monthly_excel_path || DEFAULT_MONTHLY_EXCEL_PATH);
  const [reportingError, setReportingError] = useState(false);
  const [reportFeedback, setReportFeedback] = useState("");
  const [submitFeedback, setSubmitFeedback] = useState("");
  const [reportTypeErrorArmed, setReportTypeErrorArmed] = useState(false);
  const previewUrlCacheRef = useRef(new Map());
  const reportFeedbackTimerRef = useRef(null);
  const localExcelInputRef = useRef(null);

  useEffect(() => {
    setDraft((previous) => {
      if (state.reviewRows.length) {
        return buildDraftRowsFromBackend(state.reviewRows, state.runDate, previous);
      }
      return buildDraftRowsFromFiles(state.files, state.runDate, previous);
    });
  }, [state.files, state.reviewRows, state.runDate]);

  useEffect(() => {
    const nextMode = effectiveBatchType === "daily" ? "overwrite" : state.mergeRequestPayload?.mode || "overwrite";
    setMergeMode(nextMode);
    setMonthlyPath(state.mergeRequestPayload?.monthly_excel_path || DEFAULT_MONTHLY_EXCEL_PATH);
  }, [effectiveBatchType, state.mergeRequestPayload?.mode, state.mergeRequestPayload?.monthly_excel_path]);

  useEffect(() => {
    setReportTypeErrorArmed(false);
  }, [state.batch?.batch_id]);

  useEffect(
    () => () => {
      for (const objectUrl of previewUrlCacheRef.current.values()) {
        URL.revokeObjectURL(objectUrl);
      }
      previewUrlCacheRef.current.clear();
      if (reportFeedbackTimerRef.current) {
        clearTimeout(reportFeedbackTimerRef.current);
        reportFeedbackTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (!state.batch?.batch_id || state.batch.status !== "review_ready") {
      return;
    }
    void actions.fetchReviewRows();
  }, [actions.fetchReviewRows, state.batch?.batch_id, state.batch?.status]);

  const onChangeCell = useCallback((section, rowId, key, value) => {
    setDraft((previous) => ({
      ...previous,
      [section]: previous[section].map((row) => (row.id === rowId ? { ...row, [key]: value } : row)),
    }));
  }, []);

  const totalRows = useMemo(
    () => draft.bar.length + draft.zbon.length + draft.office.length,
    [draft.bar.length, draft.office.length, draft.zbon.length],
  );

  const hasBatch = Boolean(state.batch?.batch_id);
  const hasSubmittedReview = state.reviewSubmitted || (state.batch?.review_rows_count || 0) > 0;
  const canReportTypeError = effectiveBatchType === "office" && reportTypeErrorArmed && hasBatch && !state.reportTypeErrorConsumed;
  const shouldRenderReportTypeErrorButton = effectiveBatchType === "office" && hasBatch;
  const reportTypeErrorDisabled = !canReportTypeError || reportingError || flags.isBusy;
  const hasMergeSource = monthlyPathSource === SOURCE_LOCAL_FILE ? true : Boolean(larkSheetLink.trim() || monthlyPath.trim());
  const submitDisabled = !hasBatch || flags.isBusy || !totalRows || !hasMergeSource;
  const showRetryMerge = state.batch?.status === "failed" && hasSubmittedReview;

  const onSubmit = useCallback(async () => {
    setLocalError("");
    setSubmitFeedback("");

    if (monthlyPathSource === SOURCE_LARK_SHEET && !isValidHttpUrl(larkSheetLink)) {
      setLocalError(t("review.invalidLarkUrl"));
      return;
    }

    const rows = composeReviewRows(draft);
    if (!rows.length) {
      setLocalError(t("review.noRows"));
      return;
    }

    const reviewOk = await actions.submitReviewOnly(rows);
    if (!reviewOk) {
      setLocalError(t("review.submitFailed"));
      return;
    }
    setReportTypeErrorArmed(true);
    setSubmitFeedback(t("review.submitRepeatHint"));

    let resolvedMonthlyPath = monthlyPathSource === SOURCE_LOCAL_FILE && !selectedLocalFile ? "" : monthlyPath.trim();
    if (monthlyPathSource === SOURCE_LOCAL_FILE && selectedLocalFile) {
      const uploadedPath = await actions.resolveMonthlyPathFromLocal(selectedLocalFile);
      if (!uploadedPath || isNonRealPath(uploadedPath)) {
        setLocalError(t("review.localUploadFailed"));
        return;
      }
      resolvedMonthlyPath = uploadedPath;
      setMonthlyPath(uploadedPath);
    }

    const mergeOk = await actions.queueMergeOnly({
      mode: effectiveBatchType === "daily" ? "overwrite" : mergeMode,
      monthly_excel_path: resolvedMonthlyPath,
      metadata: monthlyPathSource === SOURCE_LARK_SHEET ? { lark_sheet_link: larkSheetLink.trim() } : {},
    });
    if (!mergeOk) {
      setLocalError(t("review.mergeQueueFailed"));
    }
  }, [actions, draft, effectiveBatchType, larkSheetLink, mergeMode, monthlyPath, monthlyPathSource, selectedLocalFile, t]);

  const onRetryMerge = useCallback(async () => {
    setLocalError("");
    const ok = await actions.retryMerge();
    if (!ok) {
      setLocalError(t("review.retryMergeFailed"));
    }
  }, [actions, t]);

  const onReportTypeError = useCallback(async () => {
    if (reportingError) {
      return;
    }
    setLocalError("");
    setReportFeedback("");
    setReportingError(true);

    const payload = await actions.reportTypeError(state.batch?.batch_id);
    if (!payload) {
      setLocalError(t("review.reportError.failed"));
      setReportingError(false);
      return;
    }
    setReportTypeErrorArmed(false);

    if (payload.status === "reported") {
      setReportFeedback(t("review.reportError.reported", { count: payload.corrections?.length || 0 }));
    } else {
      setReportFeedback(t("review.reportError.skipped"));
    }
    if (reportFeedbackTimerRef.current) {
      clearTimeout(reportFeedbackTimerRef.current);
    }
    reportFeedbackTimerRef.current = setTimeout(() => {
      setReportFeedback("");
      reportFeedbackTimerRef.current = null;
    }, 4000);
    setReportingError(false);
  }, [actions, reportingError, state.batch?.batch_id, t]);

  const onOpenMergedResult = useCallback(async () => {
    setLocalError("");

    const mergedHref = resolveMergedResultHref(state.batch);
    if (!mergedHref) {
      setLocalError(t("review.openMergedResultUnavailable"));
      return;
    }
    window.open(mergedHref, "_blank", "noopener,noreferrer");
  }, [state.batch, t]);

  const onSelectLocalExcel = useCallback(async (event) => {
    const selected = event.target.files?.[0];
    if (!selected) {
      return;
    }
    setLocalError("");
    setSelectedLocalFile(selected);
    setSelectedLocalFileName(selected.name);
    setMonthlyPath("");
    setMonthlyPathSource(SOURCE_LOCAL_FILE);

    const resolvedPath = await actions.resolveMonthlyPathFromLocal(selected);
    if (resolvedPath && !isNonRealPath(resolvedPath)) {
      setMonthlyPath(resolvedPath);
    }
  }, [actions]);

  const onTriggerLocalExcelPicker = useCallback(() => {
    localExcelInputRef.current?.click();
  }, []);

  const onViewRow = useCallback(
    (row) => {
      if (typeof row.preview_url === "string" && /^https?:\/\//i.test(row.preview_url)) {
        window.open(row.preview_url, "_blank", "noopener,noreferrer");
        return;
      }

      const fileEntry = state.files.find((entry) => entry.id === row.id || entry.name === row.filename);
      if (fileEntry?.file) {
        let objectUrl = previewUrlCacheRef.current.get(fileEntry.id);
        if (!objectUrl) {
          objectUrl = URL.createObjectURL(fileEntry.file);
          previewUrlCacheRef.current.set(fileEntry.id, objectUrl);
        }
        window.open(objectUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const fallbackPath =
        (typeof row.preview_path === "string" ? row.preview_path : "") ||
        findBatchInputPathByFilename(state.batch?.inputs || [], row.filename) ||
        (typeof row.path === "string" ? row.path : "");
      if (fallbackPath) {
        window.open(toPreviewHref(fallbackPath), "_blank", "noopener,noreferrer");
        return;
      }

      setLocalError(t("review.previewUnavailable"));
    },
    [state.batch?.inputs, state.files, t],
  );

  return (
    <AppFrame>
      <header className="app-topbar section-enter">
        <div>
          <h1>{t("review.title")}</h1>
          <p>{t("review.subtitle")}</p>
        </div>
        <div className="topbar-meta">
          <span className="topbar-chip success">{t("common.apiConnected", { mode: client.mode })}</span>
          <StatusBadge status={state.batch?.status} />
        </div>
      </header>

      <section className="kpi-strip section-enter">
        <article className="kpi-card">
          <p className="kpi-label">{t("review.currentBatch")}</p>
          <p className="kpi-value">{state.batch?.batch_id || "--"}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">{t("review.rows")}</p>
          <p className="kpi-value">{totalRows}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">{t("review.reviewRowsCount")}</p>
          <p className="kpi-value">{state.batch?.review_rows_count ?? 0}</p>
        </article>
      </section>

      <section className="ledger-shell space-y-4">
        {!state.batch ? <AlertBanner tone="error" message={t("review.noBatch")} /> : null}
        {state.batch && flags.isBusy ? (
          <AlertBanner message={t("review.submitBlockedWhileProcessing", { status: state.batch.status })} />
        ) : null}
        {state.reviewRowsLoading ? <AlertBanner message={t("review.loadingRows")} /> : null}

        <ReviewCategoryTable
          title={t("review.section.barTitle")}
          description={t("review.section.barDesc")}
          rows={draft.bar}
          columns={barColumns}
          onChangeCell={(rowId, key, value) => onChangeCell("bar", rowId, key, value)}
          onViewRow={onViewRow}
        />

        <ReviewCategoryTable
          title={t("review.section.zbonTitle")}
          description={t("review.section.zbonDesc")}
          rows={draft.zbon}
          columns={zbonColumns}
          onChangeCell={(rowId, key, value) => onChangeCell("zbon", rowId, key, value)}
          onViewRow={onViewRow}
        />

        <ReviewCategoryTable
          title={t("review.section.officeTitle")}
          description={t("review.section.officeDesc")}
          rows={draft.office}
          columns={officeColumns}
          onChangeCell={(rowId, key, value) => onChangeCell("office", rowId, key, value)}
          onViewRow={onViewRow}
        />

        <section className="ledger-card p-4">
          <header className="mb-3">
            <h3 className="text-lg font-semibold">{t("review.confirmTitle")}</h3>
            <p className="mt-1 text-sm text-ledger-smoke">{t("review.confirmDesc")}</p>
          </header>

          <div className="source-switch">
            <button
              type="button"
              className={`source-switch-btn ${monthlyPathSource === SOURCE_LOCAL_FILE ? "active" : ""}`}
              onClick={() => setMonthlyPathSource(SOURCE_LOCAL_FILE)}
            >
              {t("review.source.local")}
            </button>
            <button
              type="button"
              className={`source-switch-btn ${monthlyPathSource === SOURCE_LARK_SHEET ? "active" : ""}`}
              onClick={() => setMonthlyPathSource(SOURCE_LARK_SHEET)}
            >
              {t("review.source.lark")}
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-ledger-smoke">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ledger-ink">{t("review.mode")}</span>
              <select
                className="review-cell-input"
                value={effectiveBatchType === "daily" ? "overwrite" : mergeMode}
                onChange={(event) => setMergeMode(event.target.value)}
                disabled={effectiveBatchType === "daily"}
              >
                <option value="overwrite">{t("review.modeOverwrite")}</option>
                {effectiveBatchType === "office" ? <option value="append">{t("review.modeAppend")}</option> : null}
              </select>
              {effectiveBatchType === "daily" ? <span className="text-xs">{t("review.dailyModeFixed")}</span> : null}
            </label>

            <label className="flex flex-col gap-1 text-sm text-ledger-smoke">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ledger-ink">{t("review.monthlyPath")}</span>
              <input
                type="text"
                className={`review-cell-input ${monthlyPath.trim() ? "" : "text-slate-400"}`}
                placeholder={DEFAULT_MONTHLY_EXCEL_PATH}
                value={monthlyPath}
                readOnly
              />
            </label>
          </div>

          {monthlyPathSource === SOURCE_LOCAL_FILE ? (
            <div className="mt-3">
              <div className="flex flex-col gap-1 text-sm text-ledger-smoke">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ledger-ink">{t("review.chooseLocalExcel")}</span>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={onTriggerLocalExcelPicker}>
                    {t("review.chooseFile")}
                  </Button>
                  <span className="text-sm text-ledger-smoke">{selectedLocalFileName || t("review.noFileSelected")}</span>
                </div>
                <input
                  ref={localExcelInputRef}
                  type="file"
                  aria-label={t("review.chooseLocalExcel")}
                  accept=".xlsx,.xls"
                  onChange={onSelectLocalExcel}
                  className="sr-only"
                />
                {selectedLocalFileName ? <span className="text-xs text-ledger-smoke">{t("review.selectedFile", { name: selectedLocalFileName })}</span> : null}
              </div>
            </div>
          ) : null}

          {monthlyPathSource === SOURCE_LARK_SHEET ? (
            <div className="mt-3">
              <label className="flex flex-col gap-1 text-sm text-ledger-smoke">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-ledger-ink">{t("review.larkLink")}</span>
                <input
                  type="text"
                  className="review-cell-input"
                  placeholder="https://*.larksuite.com/sheets/..."
                  value={larkSheetLink}
                  onChange={(event) => setLarkSheetLink(event.target.value)}
                />
                <span className="text-xs text-ledger-smoke">{t("review.larkComingSoon")}</span>
              </label>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="primary" onClick={() => void onSubmit()} disabled={submitDisabled}>
              {t("common.submit")}
            </Button>
            {shouldRenderReportTypeErrorButton ? (
              <Button type="button" variant="danger" onClick={() => void onReportTypeError()} disabled={reportTypeErrorDisabled}>
                {reportingError ? t("review.reportError.reporting") : t("review.reportError.action")}
              </Button>
            ) : null}
            {state.batch?.status === "merged" ? (
              <Button
                type="button"
                variant="success"
                onClick={() => void onOpenMergedResult()}
              >
                {t("review.openMergedResult")}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => navigate("/")}>
              {t("common.backToUpload")}
            </Button>
            {showRetryMerge ? (
              <Button type="button" variant="danger" onClick={() => void onRetryMerge()} disabled={flags.isBusy}>
                {t("review.retryMerge")}
              </Button>
            ) : null}
          </div>
        </section>

        {localError ? <AlertBanner tone="error" message={localError} /> : null}
        {flags.isDone ? <AlertBanner message={t("review.doneAndResubmitHint")} /> : submitFeedback ? <AlertBanner message={submitFeedback} /> : null}
        {reportFeedback ? <AlertBanner message={reportFeedback} /> : null}
        {state.systemError ? <AlertBanner tone="error" message={state.systemError} /> : null}
      </section>
    </AppFrame>
  );
}

/**
 * Build editable rows for each category while preserving existing edits.
 * @param {Array<{ id: string; name: string; category: "bar" | "zbon" | "office" | null }>} files
 * @param {string} runDate
 * @param {{ bar: Array<Record<string, string>>; zbon: Array<Record<string, string>>; office: Array<Record<string, string>> } | null} previous
 */
function buildDraftRowsFromFiles(files, runDate, previous) {
  const previousMap = new Map();

  if (previous) {
    for (const section of ["bar", "zbon", "office"]) {
      for (const row of previous[section]) {
        previousMap.set(row.id, row);
      }
    }
  }

  const draft = { bar: [], zbon: [], office: [] };

  for (const file of files) {
    if (file.category === "bar") {
      const current = previousMap.get(file.id);
      draft.bar.push({
        id: file.id,
        category: "bar",
        filename: file.name,
        store_name: current?.store_name ?? "-",
        brutto: current?.brutto ?? "-",
        netto: current?.netto ?? "-",
        run_date: current?.run_date ?? runDate ?? "-",
        score: current?.score ?? {},
        raw_result: current?.raw_result ?? {},
        preview_path: current?.preview_path ?? "",
        preview_url: current?.preview_url ?? "",
      });
      continue;
    }

    if (file.category === "zbon") {
      const current = previousMap.get(file.id);
      draft.zbon.push({
        id: file.id,
        category: "zbon",
        filename: file.name,
        brutto: current?.brutto ?? "-",
        netto: current?.netto ?? "-",
        run_date: current?.run_date ?? runDate ?? "-",
        score: current?.score ?? {},
        raw_result: current?.raw_result ?? {},
        preview_path: current?.preview_path ?? "",
        preview_url: current?.preview_url ?? "",
      });
      continue;
    }

    if (file.category === "office") {
      const current = previousMap.get(file.id);
      draft.office.push({
        id: file.id,
        category: "office",
        filename: file.name,
        type: current?.type ?? "-",
        sender: current?.sender ?? "-",
        brutto: current?.brutto ?? "-",
        netto: current?.netto ?? "-",
        tax_id: current?.tax_id ?? "-",
        receiver_ok: current?.receiver_ok ?? "-",
        receiver_address_ok: current?.receiver_address_ok ?? "-",
        score: current?.score ?? {},
        raw_result: current?.raw_result ?? {},
        preview_path: current?.preview_path ?? "",
        preview_url: current?.preview_url ?? "",
      });
    }
  }

  return draft;
}

/**
 * Build editable rows from backend review rows payload.
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} runDate
 * @param {{ bar: Array<Record<string, string>>; zbon: Array<Record<string, string>>; office: Array<Record<string, string>> } | null} previous
 */
function buildDraftRowsFromBackend(rows, runDate, previous) {
  const previousMap = new Map();

  if (previous) {
    for (const section of ["bar", "zbon", "office"]) {
      for (const row of previous[section]) {
        previousMap.set(row.id, row);
      }
    }
  }

  const draft = { bar: [], zbon: [], office: [] };

  rows.forEach((row, index) => {
    const category = String(row.category || "").toLowerCase();
    const filename = normalizeCellValue(row.filename, "-");
    const rowId = normalizeCellValue(row.row_id, `${category || "unknown"}:${filename}:${index}`);
    const result = row.result && typeof row.result === "object" ? row.result : {};
    const current = previousMap.get(rowId);
      const common = {
        id: rowId,
        category,
        filename,
        preview_url: normalizeCellValue(row.preview_url, ""),
        preview_path: normalizeCellValue(row.preview_path, ""),
        path: normalizeCellValue(row.path, ""),
        skip_reason: typeof row.skip_reason === "string" ? row.skip_reason : "",
        score: row.score && typeof row.score === "object" ? row.score : {},
        raw_result: result,
      };

    if (category === "bar") {
      draft.bar.push({
        ...common,
        store_name: current?.store_name ?? normalizeCellValue(result.store_name),
        brutto: current?.brutto ?? normalizeCellValue(result.brutto),
        netto: current?.netto ?? normalizeCellValue(result.netto),
        run_date: current?.run_date ?? normalizeCellValue(result.run_date, runDate || "-"),
      });
      return;
    }

    if (category === "zbon") {
      draft.zbon.push({
        ...common,
        brutto: current?.brutto ?? normalizeCellValue(result.brutto),
        netto: current?.netto ?? normalizeCellValue(result.netto),
        run_date: current?.run_date ?? normalizeCellValue(result.run_date, runDate || "-"),
      });
      return;
    }

    if (category === "office") {
      draft.office.push({
        ...common,
        type: current?.type ?? normalizeCellValue(result.type),
        sender: current?.sender ?? normalizeCellValue(result.sender),
        brutto: current?.brutto ?? normalizeCellValue(result.brutto),
        netto: current?.netto ?? normalizeCellValue(result.netto),
        tax_id: current?.tax_id ?? normalizeCellValue(result.tax_id),
        receiver_ok: current?.receiver_ok ?? normalizeReceiverOkValue(result.receiver_ok),
        receiver_address_ok: current?.receiver_address_ok ?? normalizeReceiverOkValue(result.receiver_address_ok),
      });
    }
  });

  return draft;
}

/**
 * Convert local draft tables into API review rows payload.
 * @param {{ bar: Array<Record<string, string>>; zbon: Array<Record<string, string>>; office: Array<Record<string, string>> }} draft
 */
function composeReviewRows(draft) {
  return [...draft.bar, ...draft.zbon, ...draft.office]
    .map((row) => {
      const category = String(row.category || "").toLowerCase();
      const baseResult = row.raw_result && typeof row.raw_result === "object" ? { ...row.raw_result } : {};

      if (category === "bar") {
        baseResult.store_name = row.store_name;
        baseResult.brutto = row.brutto;
        baseResult.netto = row.netto;
        baseResult.run_date = row.run_date;
      } else if (category === "zbon") {
        baseResult.brutto = row.brutto;
        baseResult.netto = row.netto;
        baseResult.run_date = row.run_date;
      } else if (category === "office") {
        baseResult.type = row.type;
        baseResult.sender = row.sender;
        baseResult.brutto = row.brutto;
        baseResult.netto = row.netto;
        baseResult.tax_id = row.tax_id;
        baseResult.receiver_ok = parseReceiverOkValue(row.receiver_ok);
        baseResult.receiver_address_ok = parseReceiverOkValue(row.receiver_address_ok);
      }

      const payload = {
        row_id: row.id,
        category,
        filename: row.filename,
        result: baseResult,
        score: row.score && typeof row.score === "object" ? row.score : {},
      };

      const previewPathCandidate = [row.preview_path, row.path].find(
        (value) => typeof value === "string" && value.trim() && value.trim() !== "-",
      );
      if (previewPathCandidate) {
        payload.preview_path = previewPathCandidate;
      }

      return payload;
    })
    .filter((row) => Boolean(row.category) && Boolean(row.filename));
}

/**
 * Basic URL validation for scaffold-level lark link input.
 * @param {string} value
 */
function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Find batch input path by fuzzy filename match.
 * @param {Array<{ path?: string }>} inputs
 * @param {string} filename
 */
function findBatchInputPathByFilename(inputs, filename) {
  const target = String(filename || "").toLowerCase();
  if (!target) {
    return "";
  }
  const matched = inputs.find((entry) => String(entry?.path || "").toLowerCase().includes(target));
  return matched?.path || "";
}

/**
 * Convert backend/local path to browser-openable URL.
 * @param {string} rawPath
 */
function toPreviewHref(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (/^[a-zA-Z]:\\/.test(value)) {
    return `file:///${value.replace(/\\/g, "/")}`;
  }
  const normalized = value.replace(/^\.?[\\/]+/, "").replace(/\\/g, "/");
  return `${API_BASE_URL}/${normalized}`;
}

/**
 * Resolve merged result URL from backend batch payload.
 * @param {Record<string, unknown> | null | undefined} batch
 */
function resolveMergedResultHref(batch) {
  const mergeOutput = batch?.merge_output;
  if (!mergeOutput || typeof mergeOutput !== "object") {
    return "";
  }

  const directUrlKeys = ["output_url", "download_url", "url"];
  for (const key of directUrlKeys) {
    const value = mergeOutput[key];
    if (typeof value === "string" && value.trim()) {
      return toPreviewHref(value);
    }
  }

  const absolutePathKeys = ["merged_excel_path", "output_abs_path", "absolute_path", "abs_path", "full_path"];
  for (const key of absolutePathKeys) {
    const value = mergeOutput[key];
    if (typeof value === "string" && value.trim()) {
      return toPreviewHref(value);
    }
  }

  const outputPath = mergeOutput.output_path;
  if (typeof outputPath === "string" && outputPath.trim()) {
    if (isAbsolutePath(outputPath)) {
      return toPreviewHref(outputPath);
    }
    const resolvedAbsolute = resolveAbsolutePathFromBatch(outputPath, batch);
    if (resolvedAbsolute) {
      return toPreviewHref(resolvedAbsolute);
    }
  }

  return "";
}

/**
 * Resolve one relative output path to local absolute path using known absolute hints.
 * @param {string} relativePath
 * @param {Record<string, unknown> | null | undefined} batch
 */
function resolveAbsolutePathFromBatch(relativePath, batch) {
  const normalizedRelative = String(relativePath || "").trim();
  if (!normalizedRelative || isAbsolutePath(normalizedRelative)) {
    return "";
  }

  const normalizedRelativeSlash = normalizedRelative.replace(/\\/g, "/").replace(/^\/+/, "");
  const outputAnchor = "/outputs/";
  const anchorIndex = normalizedRelativeSlash.indexOf(outputAnchor.slice(1));
  if (anchorIndex < 0) {
    return "";
  }

  const tailFromOutputs = normalizedRelativeSlash.slice(anchorIndex + 1);
  const absoluteInputs = Array.isArray(batch?.inputs)
    ? batch.inputs
        .map((item) => (typeof item?.path === "string" ? item.path.trim() : ""))
        .filter((value) => value && isAbsolutePath(value))
    : [];

  for (const absoluteInput of absoluteInputs) {
    const inputSlash = absoluteInput.replace(/\\/g, "/");
    const outputsIndex = inputSlash.toLowerCase().indexOf(outputAnchor);
    if (outputsIndex < 0) {
      continue;
    }
    const prefix = inputSlash.slice(0, outputsIndex);
    if (!prefix) {
      continue;
    }
    const useBackslash = /^[a-zA-Z]:\//.test(inputSlash);
    const candidate = useBackslash ? `${prefix}/${tailFromOutputs}`.replace(/\//g, "\\") : `${prefix}/${tailFromOutputs}`;
    if (isAbsolutePath(candidate)) {
      return candidate;
    }
  }

  return "";
}

/**
 * Check whether a path is absolute (URL, Windows absolute, Unix absolute, or file URL).
 * @param {string} rawPath
 */
function isAbsolutePath(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) {
    return false;
  }
  if (/^https?:\/\//i.test(value) || /^file:\/\//i.test(value)) {
    return true;
  }
  if (/^[a-zA-Z]:\\/.test(value)) {
    return true;
  }
  return value.startsWith("/");
}

/**
 * Check whether a returned path is placeholder/mock instead of real backend path.
 * @param {string | null | undefined} rawPath
 */
function isNonRealPath(rawPath) {
  const value = String(rawPath || "").trim().toLowerCase();
  return !value || value.startsWith("local://") || value.startsWith("mock://");
}

/**
 * Normalize input values to editable table cell text.
 * @param {unknown} value
 * @param {string} [fallback]
 */
function normalizeCellValue(value, fallback = "-") {
  if (value === null || value === undefined) {
    return fallback;
  }
  const text = String(value).trim();
  return text || fallback;
}

/**
 * Normalize receiver_ok value for editable office table.
 * @param {unknown} value
 */
function normalizeReceiverOkValue(value) {
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  return normalizeCellValue(value);
}

/**
 * Parse receiver_ok from user-edited cell text into boolean/nullable payload.
 * @param {unknown} value
 */
function parseReceiverOkValue(value) {
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value ?? "").trim().toLowerCase();
  if (!text || text === "-") {
    return null;
  }
  if (["true", "yes", "1", "ok"].includes(text)) {
    return true;
  }
  if (["false", "no", "0"].includes(text)) {
    return false;
  }
  return null;
}
