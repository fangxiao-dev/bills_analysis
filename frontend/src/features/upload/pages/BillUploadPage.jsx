import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AppFrame } from "../../../app/AppFrame";
import { BatchTypeSelector } from "../components/BatchTypeSelector";
import { PdfDropzone } from "../components/PdfDropzone";
import { FileQueuePanel } from "../components/FileQueuePanel";
import { RunDatePicker } from "../components/RunDatePicker";
import { StatusBadge } from "../components/StatusBadge";
import { AlertBanner } from "../../../shared/ui/AlertBanner";
import { Button } from "../../../shared/ui/Button";
import { useUploadFlowContext } from "../state/UploadFlowContext";

/**
 * Main M1 upload page focused on file intake and batch creation.
 */
export function BillUploadPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { client, state, actions, flags } = useUploadFlowContext();

  const canGoReview =
    state.batch &&
    (state.batch.status === "review_ready" || state.batch.status === "merging" || state.batch.status === "merged");

  const statusMessage = (() => {
    if (!state.batch) {
      return "";
    }
    if (state.batch.status === "review_ready") {
      return t("upload.reviewReadyNowHint");
    }
    if (state.batch.status === "merged") {
      return t("upload.doneHint");
    }
    if (state.batch.status === "queued" || state.batch.status === "running" || state.batch.status === "merging" || state.phase === "creating" || state.phase === "tracking") {
      return state.phase === "creating" ? t("upload.creatingHint") : t("upload.trackingHint");
    }
    return "";
  })();

  const handleBatchTypeChange = (nextType) => {
    if (nextType === state.batchType) {
      return;
    }
    if (state.files.length) {
      const shouldSwitch = window.confirm(t("upload.switchTypeConfirm"));
      if (!shouldSwitch) {
        return;
      }
    }
    actions.setBatchType(nextType);
  };

  return (
    <AppFrame>
      <header className="app-topbar section-enter">
        <div>
          <h1>{t("upload.title")}</h1>
          <p>{t("upload.subtitle")}</p>
        </div>
        <div className="topbar-meta">
          <span className="topbar-chip success">{t("common.apiConnected", { mode: client.mode })}</span>
          <span className="topbar-chip">{t("common.type", { type: state.batchType.toUpperCase() })}</span>
        </div>
      </header>

      <section className="kpi-strip section-enter">
        <article className="kpi-card">
          <p className="kpi-label">{t("upload.queuedFiles")}</p>
          <p className="kpi-value">{state.files.length}</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">{t("upload.backendStatus")}</p>
          <div className="mt-1">
            <StatusBadge status={state.batch?.status} />
          </div>
        </article>
      </section>

      <section className="ledger-shell">
        <section className="section-enter ledger-card p-4">
          <div className="grid gap-4 md:grid-cols-[1.1fr_1fr] md:items-end">
            <BatchTypeSelector value={state.batchType} onChange={handleBatchTypeChange} />
            <RunDatePicker value={state.runDate} onChange={actions.setRunDate} />
          </div>
          <p className="mt-2 text-xs text-ledger-smoke">{t("upload.switchTypeHint")}</p>

          {state.batchType === "daily" ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <PdfDropzone
                onFilesAdded={(files) => actions.addFiles(files, "bar")}
                disabled={flags.isBusy}
                title={t("upload.barTitle")}
                description={t("upload.barDesc")}
                buttonText={t("common.addPdf")}
                allowMultiple
              />
              <PdfDropzone
                onFilesAdded={(files) => actions.addFiles(files, "zbon")}
                disabled={flags.isBusy}
                title={t("upload.zbonTitle")}
                description={t("upload.zbonDesc")}
                buttonText={t("common.addPdf")}
                allowMultiple={false}
              />
            </div>
          ) : (
            <div className="mt-4">
              <PdfDropzone
                onFilesAdded={(files) => actions.addFiles(files, "office")}
                disabled={flags.isBusy}
                title={t("upload.officeTitle")}
                description={t("upload.officeDesc")}
                buttonText={t("common.addPdf")}
              />
            </div>
          )}

          {state.rejectedMessage ? (
            <div className="mt-3">
              <AlertBanner tone="error" message={state.rejectedMessage} />
            </div>
          ) : null}

          <div className="mt-4">
            <h2 className="mb-2 text-lg font-semibold">{t("upload.itemsToConfirm")}</h2>
            <FileQueuePanel files={state.files} onRemove={actions.removeFile} />
          </div>

          {state.formError ? (
            <div className="mt-3">
              <AlertBanner tone="error" message={state.formError} />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => void actions.submitBatch()}
              disabled={!flags.canSubmitBatch || !state.files.length}
            >
              {t("upload.createBatch")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => actions.retryPolling()} disabled={!state.batch || flags.isBusy}>
              {t("upload.retryPoll")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => navigate("/manual-review")} disabled={!canGoReview}>
              {t("upload.goManualReview")}
            </Button>
          </div>

          {state.batch && !canGoReview && !statusMessage ? (
            <div className="mt-3">
              <AlertBanner message={t("upload.reviewReadyHint", { status: state.batch.status })} />
            </div>
          ) : null}
          {statusMessage ? <AlertBanner message={statusMessage} /> : null}

          {state.systemError ? <AlertBanner tone="error" message={state.systemError} /> : null}
          {flags.isDone && !statusMessage ? <AlertBanner message={t("upload.doneHint")} /> : null}
        </section>
      </section>
    </AppFrame>
  );
}
