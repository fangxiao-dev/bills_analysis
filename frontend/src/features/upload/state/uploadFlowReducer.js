/**
 * @typedef {"idle" | "ready" | "creating" | "tracking" | "review_ready" | "review_submitting" | "done" | "failed"} UploadPhase
 */

/**
 * @typedef {Object} UploadFileEntry
 * @property {string} id
 * @property {File} file
 * @property {string} name
 * @property {number} size
 * @property {"bar" | "zbon" | "office" | null} category
 */

/**
 * Seed JSON that mirrors expected review request structure.
 */
export const DEFAULT_REVIEW_TEXT = JSON.stringify(
  [
    {
      row_id: "bar:sample.pdf:0",
      category: "bar",
      filename: "sample.pdf",
      result: { brutto: "1.0" },
      score: {},
    },
  ],
  null,
  2,
);

/**
 * Initial upload flow state.
 */
export const initialUploadState = {
  phase: "idle",
  batchType: "daily",
  runDate: formatRunDate(new Date()),
  files: [],
  reviewRows: [],
  reviewRowsLoading: false,
  batch: null,
  mergeTask: null,
  reviewSubmitted: false,
  reportTypeErrorConsumed: false,
  mergeRequested: false,
  lastMergeTaskId: null,
  mergeRequestPayload: {
    mode: "overwrite",
    monthly_excel_path: null,
  },
  formError: "",
  systemError: "",
  rejectedMessage: "",
  reviewRowsText: DEFAULT_REVIEW_TEXT,
};

/**
 * Reducer that controls the upload/review lifecycle.
 * @param {typeof initialUploadState} state
 * @param {Record<string, any>} action
 */
export function uploadFlowReducer(state, action) {
  switch (action.type) {
    case "SET_BATCH_TYPE": {
      const nextType = action.value;
      if (nextType === state.batchType) {
        return state;
      }
      return {
        ...state,
        batchType: nextType,
        files: [],
        reviewRows: [],
        reviewRowsLoading: false,
        batch: null,
        mergeTask: null,
        reviewSubmitted: false,
        reportTypeErrorConsumed: false,
        mergeRequested: false,
        lastMergeTaskId: null,
        mergeRequestPayload: {
          mode: "overwrite",
          monthly_excel_path: null,
        },
        formError: "",
        systemError: "",
        rejectedMessage: "",
        reviewRowsText: DEFAULT_REVIEW_TEXT,
        phase: "idle",
      };
    }

    case "SET_RUN_DATE":
      return { ...state, runDate: action.value };

    case "ADD_FILES": {
      const nextFiles = [...state.files, ...action.entries];
      return {
        ...state,
        files: nextFiles,
        rejectedMessage: action.rejectedMessage || "",
        formError: "",
        phase: nextFiles.length ? "ready" : state.phase,
      };
    }

    case "REMOVE_FILE": {
      const files = state.files.filter((entry) => entry.id !== action.id);
      return {
        ...state,
        files,
        phase: files.length ? state.phase : "idle",
      };
    }

    case "SET_FORM_ERROR":
      return {
        ...state,
        formError: action.message,
      };

    case "SET_SYSTEM_ERROR":
      return {
        ...state,
        systemError: action.message,
      };

    case "SET_REVIEW_TEXT":
      return {
        ...state,
        reviewRowsText: action.value,
      };

    case "SUBMIT_START":
      return {
        ...state,
        phase: "creating",
        formError: "",
        systemError: "",
      };

    case "SUBMIT_SUCCESS":
      return {
        ...state,
        phase: mapStatusToPhase(action.batch.status),
        reviewRows: [],
        reviewRowsLoading: false,
        batch: action.batch,
        mergeTask: null,
        reviewSubmitted: false,
        reportTypeErrorConsumed: false,
        mergeRequested: false,
        lastMergeTaskId: null,
        systemError: "",
      };

    case "SUBMIT_FAILURE":
      return {
        ...state,
        phase: "failed",
        systemError: action.message,
      };

    case "POLL_SUCCESS":
      return {
        ...state,
        batch: action.batch,
        phase: mapStatusToPhase(action.batch.status),
        reviewSubmitted: state.reviewSubmitted || (action.batch.review_rows_count || 0) > 0,
      };

    case "POLL_FAILURE":
      return {
        ...state,
        systemError: action.message,
      };

    case "REVIEW_ROWS_LOAD_START":
      return {
        ...state,
        reviewRowsLoading: true,
      };

    case "REVIEW_ROWS_LOAD_SUCCESS":
      return {
        ...state,
        reviewRows: action.rows,
        reviewRowsLoading: false,
      };

    case "REVIEW_ROWS_LOAD_FAILURE":
      return {
        ...state,
        reviewRowsLoading: false,
      };

    case "REVIEW_SUBMIT_START":
      return {
        ...state,
        phase: "review_submitting",
        systemError: "",
      };

    case "REVIEW_SUBMIT_SUCCESS":
      return {
        ...state,
        phase: mapStatusToPhase(action.batch.status),
        batch: action.batch,
        reviewSubmitted: true,
        reportTypeErrorConsumed: false,
        systemError: "",
      };

    case "REPORT_TYPE_ERROR_SUCCESS":
      return {
        ...state,
        reportTypeErrorConsumed: action.payload?.status === "reported" ? true : state.reportTypeErrorConsumed,
      };

    case "REVIEW_SUBMIT_FAILURE":
      return {
        ...state,
        phase: state.batch ? mapStatusToPhase(state.batch.status) : state.phase,
        systemError: action.message,
      };

    case "MERGE_QUEUE_START":
      return {
        ...state,
        systemError: "",
      };

    case "MERGE_QUEUE_SUCCESS":
      return {
        ...state,
        phase: "tracking",
        mergeTask: action.task,
        mergeRequested: true,
        lastMergeTaskId: action.task.task_id,
        mergeRequestPayload: action.payload,
      };

    case "MERGE_QUEUE_FAILURE":
      return {
        ...state,
        phase: state.batch ? mapStatusToPhase(state.batch.status) : state.phase,
        systemError: action.message,
      };

    default:
      return state;
  }
}

/**
 * Keep categories aligned with chosen batch type.
 * @param {"daily" | "office"} batchType
 * @param {"bar" | "zbon" | "office" | null} current
 */
export function normalizeCategoryForBatch(batchType, current) {
  if (batchType === "office") {
    return "office";
  }
  if (current === "bar" || current === "zbon") {
    return current;
  }
  return "bar";
}

/**
 * Map backend batch status to frontend phase.
 * @param {"queued" | "running" | "review_ready" | "merging" | "merged" | "failed"} status
 * @returns {UploadPhase}
 */
export function mapStatusToPhase(status) {
  if (status === "review_ready") {
    return "review_ready";
  }
  if (status === "merged") {
    return "done";
  }
  if (status === "failed") {
    return "failed";
  }
  return "tracking";
}

/**
 * Format date using backend-required DD/MM/YYYY format.
 * @param {Date} date
 */
function formatRunDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
}
