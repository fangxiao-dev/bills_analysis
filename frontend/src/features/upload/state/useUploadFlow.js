import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { isRunDateValid, parseCreateBatchRequest, parseMergeRequest, parseSubmitReviewRequest } from "../../../contracts/v1.schema";
import { AppHttpError, toErrorMessage } from "../../../lib/http";
import {
  initialUploadState,
  normalizeCategoryForBatch,
  uploadFlowReducer,
} from "./uploadFlowReducer";

/**
 * Hook that orchestrates upload flow state and API side effects.
 * @param {{
 *  client: {
 *    mode: "mock" | "real";
 *    uploadFiles: (files: File[], context: {batchType: "daily" | "office"; runDate: string | null}) => Promise<Array<{path: string; category?: "bar" | "zbon" | "office" | null}>>;
 *    createBatch: (payload: unknown) => Promise<any>;
 *    getBatch: (batchId: string) => Promise<any>;
 *    listBatches: (limit?: number) => Promise<any>;
 *    submitReview: (batchId: string, payload: unknown) => Promise<any>;
 *    queueMerge: (batchId: string, payload: unknown) => Promise<any>;
 *    createBatchUpload?: (payload: {
 *      files: Array<{ file: File; category: "bar" | "zbon" | "office" | null; name: string }>;
 *      batchType: "daily" | "office";
 *      runDate: string | null;
 *      metadata?: Record<string, unknown>;
 *    }) => Promise<{ batch_id: string }>;
 *    getReviewRows?: (batchId: string) => Promise<{ rows: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>;
 *    uploadMergeSourceLocal?: (batchId: string, file: File) => Promise<{ monthly_excel_path: string }>;
 *  };
 * }} params
 */
export function useUploadFlow({ client }) {
  const [state, dispatch] = useReducer(uploadFlowReducer, initialUploadState);
  const stateRef = useRef(state);
  const pollRef = useRef({ running: false, timer: null, retries: 0, batchId: "" });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(
    () => () => {
      stopPolling(pollRef);
    },
    [],
  );

  const setBatchType = useCallback((value) => {
    dispatch({ type: "SET_BATCH_TYPE", value });
  }, []);

  const setRunDate = useCallback((value) => {
    dispatch({ type: "SET_RUN_DATE", value });
  }, []);

  const setReviewRowsText = useCallback((value) => {
    dispatch({ type: "SET_REVIEW_TEXT", value });
  }, []);

  const removeFile = useCallback((id) => {
    dispatch({ type: "REMOVE_FILE", id });
  }, []);

  /**
   * Add selected files into queue and optionally force category by dropzone.
   * @param {FileList | File[]} fileList
   * @param {"bar" | "zbon" | "office" | null} [forcedCategory]
   */
  const addFiles = useCallback((fileList, forcedCategory = null) => {
    const files = Array.from(fileList || []);
    const current = stateRef.current;
    const seen = new Set(current.files.map((entry) => `${entry.name}-${entry.size}-${entry.file.lastModified}`));

    const rejected = [];
    const acceptedEntries = [];

    const existingZbonCount = current.files.filter((entry) => entry.category === "zbon").length;
    let incomingZbonAccepted = 0;

    for (const file of files) {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        rejected.push(file.name);
        continue;
      }

      if (forcedCategory === "zbon") {
        const nextZbonCount = existingZbonCount + incomingZbonAccepted;
        if (nextZbonCount >= 1) {
          rejected.push(`${file.name} (ZBON allows only one file)`);
          continue;
        }
      }

      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      acceptedEntries.push({
        id: safeId(),
        file,
        name: file.name,
        size: file.size,
        category: forcedCategory ?? normalizeCategoryForBatch(current.batchType, null),
      });

      if (forcedCategory === "zbon") {
        incomingZbonAccepted += 1;
      }
    }

    dispatch({
      type: "ADD_FILES",
      entries: acceptedEntries,
      rejectedMessage: rejected.length ? `Ignored non-PDF files: ${rejected.join(", ")}.` : "",
    });
  }, []);

  const pollBatch = useCallback(async () => {
    if (pollRef.current.running || !pollRef.current.batchId) {
      return;
    }

    pollRef.current.running = true;

    try {
      const batch = await client.getBatch(pollRef.current.batchId);
      dispatch({ type: "POLL_SUCCESS", batch });
      pollRef.current.retries = 0;

      if (batch.status === "queued" || batch.status === "running" || batch.status === "merging") {
        schedulePoll(pollRef, pollBatch, 1500);
      } else {
        stopPolling(pollRef);
      }
    } catch (error) {
      if (isTimeoutError(error)) {
        // Keep tracking on transient timeout instead of switching to failed immediately.
        schedulePoll(pollRef, pollBatch, 1600);
        return;
      }
      pollRef.current.retries += 1;
      if (pollRef.current.retries <= 4) {
        const backoff = 600 * 2 ** (pollRef.current.retries - 1);
        schedulePoll(pollRef, pollBatch, backoff);
      } else {
        stopPolling(pollRef);
        dispatch({ type: "POLL_FAILURE", message: toErrorMessage(error) });
      }
    } finally {
      pollRef.current.running = false;
    }
  }, [client]);

  const startPolling = useCallback(
    (batchId, delayMs = 0) => {
      stopPolling(pollRef);
      pollRef.current.batchId = batchId;
      pollRef.current.retries = 0;
      schedulePoll(pollRef, pollBatch, delayMs);
    },
    [pollBatch],
  );

  const retryPolling = useCallback(() => {
    const batchId = stateRef.current.batch?.batch_id;
    if (!batchId) {
      return;
    }
    dispatch({ type: "SET_SYSTEM_ERROR", message: "" });
    startPolling(batchId, 0);
  }, [startPolling]);

  const submitBatch = useCallback(async () => {
    const current = stateRef.current;

    if (!current.files.length) {
      dispatch({ type: "SET_FORM_ERROR", message: "Please attach at least one PDF file." });
      return false;
    }

    if (current.runDate && !isRunDateValid(current.runDate)) {
      dispatch({ type: "SET_FORM_ERROR", message: "run_date must follow DD/MM/YYYY." });
      return false;
    }

    dispatch({ type: "SUBMIT_START" });
    const submitStartedAt = Date.now();

    try {
      const metadata = {
        source: "frontend_m1",
        api_mode: client.mode,
      };

      if (typeof client.createBatchUpload === "function") {
        const uploadResult = await client.createBatchUpload({
          files: current.files.map((entry) => ({
            file: entry.file,
            category: entry.category,
            name: entry.name,
          })),
          batchType: current.batchType,
          runDate: current.runDate || null,
          metadata,
        });

        const batch = await client.getBatch(uploadResult.batch_id);
        dispatch({ type: "SUBMIT_SUCCESS", batch });
        startPolling(batch.batch_id, 220);
        return true;
      }

      const uploaded = await client.uploadFiles(
        current.files.map((entry) => entry.file),
        { batchType: current.batchType, runDate: current.runDate || null },
      );

      const inputs = uploaded.map((entry, index) => ({
        path: entry.path,
        category: current.files[index]?.category ?? entry.category ?? null,
      }));

      const payload = parseCreateBatchRequest({
        type: current.batchType,
        run_date: current.runDate || null,
        inputs,
        metadata,
      });

      const batch = await client.createBatch(payload);
      dispatch({ type: "SUBMIT_SUCCESS", batch });
      startPolling(batch.batch_id, 220);
      return true;
    } catch (error) {
      if (isTimeoutError(error) && typeof client.listBatches === "function") {
        const recovered = await recoverRecentBatch(client, current, submitStartedAt);
        if (recovered) {
          dispatch({ type: "SUBMIT_SUCCESS", batch: recovered });
          startPolling(recovered.batch_id, 220);
          return true;
        }
      }
      dispatch({ type: "SUBMIT_FAILURE", message: toErrorMessage(error) });
      return false;
    }
  }, [client, startPolling]);

  /**
   * Submit review rows only, without queuing merge.
   * @param {Array<Record<string, unknown>>} rows
   */
  const submitReviewOnly = useCallback(
    async (rows) => {
      const current = stateRef.current;
      const batchId = current.batch?.batch_id;
      if (!batchId) {
        dispatch({ type: "REVIEW_SUBMIT_FAILURE", message: "Batch id is missing." });
        return false;
      }

      dispatch({ type: "SET_REVIEW_TEXT", value: JSON.stringify(rows, null, 2) });
      dispatch({ type: "REVIEW_SUBMIT_START" });

      try {
        const reviewPayload = parseSubmitReviewRequest({ rows });
        const batch = await client.submitReview(batchId, reviewPayload);
        dispatch({ type: "REVIEW_SUBMIT_SUCCESS", batch });
        return true;
      } catch (error) {
        dispatch({ type: "REVIEW_SUBMIT_FAILURE", message: toErrorMessage(error) });
        return false;
      }
    },
    [client],
  );

  /**
   * Queue merge only, reusing default payload when omitted.
   * @param {{ mode?: "overwrite" | "append"; monthly_excel_path?: string | null; metadata?: Record<string, unknown> }} [payload]
   */
  const queueMergeOnly = useCallback(
    async (payload) => {
      const current = stateRef.current;
      const batchId = current.batch?.batch_id;
      if (!batchId) {
        dispatch({ type: "MERGE_QUEUE_FAILURE", message: "Batch id is missing." });
        return false;
      }

      const reviewReady = current.reviewSubmitted || (current.batch?.review_rows_count || 0) > 0;
      if (!reviewReady) {
        dispatch({ type: "MERGE_QUEUE_FAILURE", message: "Submit review before queueing merge." });
        return false;
      }

      dispatch({ type: "MERGE_QUEUE_START" });

      try {
        const rawMonthlyPath =
          payload?.monthly_excel_path ?? current.mergeRequestPayload?.monthly_excel_path ?? null;
        const normalizedMonthlyPath =
          typeof rawMonthlyPath === "string" ? rawMonthlyPath.trim() || null : rawMonthlyPath;

        const mergePayload = parseMergeRequest({
          mode: payload?.mode || current.mergeRequestPayload?.mode || "overwrite",
          monthly_excel_path: normalizedMonthlyPath,
          metadata: {
            source: "frontend_m1",
            ...(payload?.metadata || {}),
          },
        });
        const mergeTask = await client.queueMerge(batchId, mergePayload);
        dispatch({ type: "MERGE_QUEUE_SUCCESS", task: mergeTask, payload: mergePayload });
        startPolling(batchId, 200);
        return true;
      } catch (error) {
        dispatch({ type: "MERGE_QUEUE_FAILURE", message: toErrorMessage(error) });
        return false;
      }
    },
    [client, startPolling],
  );

  /**
   * Load backend review rows when endpoint is available.
   */
  const fetchReviewRows = useCallback(async () => {
    const current = stateRef.current;
    const batchId = current.batch?.batch_id;
    if (!batchId || typeof client.getReviewRows !== "function") {
      return [];
    }

    dispatch({ type: "REVIEW_ROWS_LOAD_START" });
    try {
      const payload = await client.getReviewRows(batchId);
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.rows) ? payload.rows : [];
      dispatch({ type: "REVIEW_ROWS_LOAD_SUCCESS", rows });
      return rows;
    } catch (error) {
      if (error instanceof AppHttpError && error.status === 404) {
        dispatch({ type: "REVIEW_ROWS_LOAD_FAILURE" });
        return [];
      }
      dispatch({ type: "REVIEW_ROWS_LOAD_FAILURE" });
      dispatch({ type: "SET_SYSTEM_ERROR", message: toErrorMessage(error) });
      return [];
    }
  }, [client]);

  /**
   * Resolve monthly excel path via backend upload endpoint with fallback.
   * @param {File | null} file
   */
  const resolveMonthlyPathFromLocal = useCallback(
    async (file) => {
      if (!file) {
        return null;
      }

      const fallback = `local://${file.name}`;
      const current = stateRef.current;
      const batchId = current.batch?.batch_id;
      if (!batchId || typeof client.uploadMergeSourceLocal !== "function") {
        return fallback;
      }

      try {
        const payload = await client.uploadMergeSourceLocal(batchId, file);
        return payload?.monthly_excel_path || fallback;
      } catch (error) {
        if (error instanceof AppHttpError && error.status === 404) {
          return fallback;
        }
        dispatch({ type: "SET_SYSTEM_ERROR", message: toErrorMessage(error) });
        return null;
      }
    },
    [client],
  );

  /**
   * Retry merge using last merge payload, only when batch failed.
   */
  const retryMerge = useCallback(async () => {
    const current = stateRef.current;
    if (current.batch?.status !== "failed") {
      dispatch({ type: "MERGE_QUEUE_FAILURE", message: "Retry merge is available only when batch status is failed." });
      return false;
    }
    const hasReviewRows = current.reviewSubmitted || (current.batch?.review_rows_count || 0) > 0;
    if (!hasReviewRows) {
      dispatch({ type: "MERGE_QUEUE_FAILURE", message: "Cannot retry merge without submitted review rows." });
      return false;
    }
    return queueMergeOnly(current.mergeRequestPayload);
  }, [queueMergeOnly]);

  /**
   * Submit structured review rows directly (used by Manual Review page).
   * @param {Array<Record<string, unknown>>} rows
   */
  const submitReviewRows = useCallback(
    async (rows) => {
      return submitReviewOnly(rows);
    },
    [submitReviewOnly],
  );

  /**
   * Backward-compatible helper that performs submit-review and queue-merge.
   */
  const submitReviewAndMerge = useCallback(async () => {
    try {
      const current = stateRef.current;
      const parsedRows = JSON.parse(current.reviewRowsText);
      const reviewOk = await submitReviewOnly(parsedRows);
      if (!reviewOk) {
        return false;
      }
      return queueMergeOnly();
    } catch (error) {
      dispatch({ type: "REVIEW_SUBMIT_FAILURE", message: toErrorMessage(error) });
      return false;
    }
  }, [queueMergeOnly, submitReviewOnly]);

  const canSubmitBatch = useMemo(
    () => state.phase === "idle" || state.phase === "ready" || state.phase === "failed",
    [state.phase],
  );

  const isBusy = useMemo(
    () => state.phase === "creating" || state.phase === "tracking" || state.phase === "review_submitting",
    [state.phase],
  );

  return {
    state,
    actions: {
      setBatchType,
      setRunDate,
      addFiles,
      removeFile,
      setReviewRowsText,
      submitBatch,
      submitReviewAndMerge,
      submitReviewOnly,
      submitReviewRows,
      queueMergeOnly,
      fetchReviewRows,
      resolveMonthlyPathFromLocal,
      retryMerge,
      retryPolling,
    },
    flags: {
      canSubmitBatch,
      isBusy,
      isReviewReady: state.phase === "review_ready",
      isDone: state.phase === "done",
    },
  };
}

/**
 * Start a polling timer while avoiding overlap.
 * @param {{ current: { timer: ReturnType<typeof setTimeout> | null } }} pollRef
 * @param {() => Promise<void>} callback
 * @param {number} delayMs
 */
function schedulePoll(pollRef, callback, delayMs) {
  if (pollRef.current.timer) {
    clearTimeout(pollRef.current.timer);
  }
  pollRef.current.timer = setTimeout(() => {
    void callback();
  }, delayMs);
}

/**
 * Stop all polling activity.
 * @param {{ current: { timer: ReturnType<typeof setTimeout> | null; batchId?: string; running?: boolean } }} pollRef
 */
function stopPolling(pollRef) {
  if (pollRef.current.timer) {
    clearTimeout(pollRef.current.timer);
    pollRef.current.timer = null;
  }
}

/**
 * Generate a browser-safe id for local file entries.
 */
function safeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return String(Date.now() + Math.round(Math.random() * 1000));
}

/**
 * Check whether an error is a request timeout.
 * @param {unknown} error
 */
function isTimeoutError(error) {
  return error instanceof AppHttpError && /timed out/i.test(error.message);
}

/**
 * Recover a recently-created batch when initial submit request times out.
 * @param {{ listBatches: (limit?: number) => Promise<{ items?: Array<any> }> }} client
 * @param {{ batchType: "daily" | "office"; runDate: string; files: Array<any> }} current
 * @param {number} submitStartedAt
 */
async function recoverRecentBatch(client, current, submitStartedAt) {
  try {
    const response = await client.listBatches(20);
    const items = Array.isArray(response?.items) ? response.items : [];
    const createdLowerBound = submitStartedAt - 120000;

    const matched = items.find((item) => {
      if (!item || item.type !== current.batchType) {
        return false;
      }
      if ((item.run_date || null) !== (current.runDate || null)) {
        return false;
      }
      const createdAt = Date.parse(item.created_at || "");
      if (Number.isNaN(createdAt)) {
        return false;
      }
      return createdAt >= createdLowerBound;
    });

    return matched || null;
  } catch {
    return null;
  }
}
