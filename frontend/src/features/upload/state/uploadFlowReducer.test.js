import { describe, expect, it } from "vitest";
import {
  initialUploadState,
  normalizeCategoryForBatch,
  uploadFlowReducer,
} from "./uploadFlowReducer";

describe("uploadFlowReducer", () => {
  it("clears queued files when switching batch type", () => {
    const state = {
      ...initialUploadState,
      batchType: "daily",
      files: [
        { id: "1", name: "a.pdf", size: 1, category: "bar", file: new File(["a"], "a.pdf", { type: "application/pdf" }) },
      ],
      batch: { batch_id: "b1", status: "review_ready" },
      reviewSubmitted: true,
      mergeRequested: true,
    };

    const next = uploadFlowReducer(state, { type: "SET_BATCH_TYPE", value: "office" });
    expect(next.files).toHaveLength(0);
    expect(next.batch).toBeNull();
    expect(next.reviewSubmitted).toBe(false);
    expect(next.mergeRequested).toBe(false);
  });

  it("sets phase to ready when files are added", () => {
    const next = uploadFlowReducer(initialUploadState, {
      type: "ADD_FILES",
      entries: [{ id: "1", name: "a.pdf", size: 2, category: "bar", file: new File(["a"], "a.pdf", { type: "application/pdf" }) }],
      rejectedMessage: "",
    });

    expect(next.phase).toBe("ready");
    expect(next.files).toHaveLength(1);
  });

  it("normalizes daily fallback category", () => {
    expect(normalizeCategoryForBatch("daily", "office")).toBe("bar");
  });

  it("stores merge task metadata on merge queue success", () => {
    const task = { task_id: "t1", task_type: "merge_batch" };
    const payload = { mode: "overwrite", monthly_excel_path: null, metadata: {} };

    const next = uploadFlowReducer(initialUploadState, { type: "MERGE_QUEUE_SUCCESS", task, payload });
    expect(next.mergeRequested).toBe(true);
    expect(next.lastMergeTaskId).toBe("t1");
    expect(next.mergeRequestPayload.mode).toBe("overwrite");
    expect(next.phase).toBe("tracking");
  });

  it("stores fetched review rows payload", () => {
    const rows = [{ row_id: "row-0001", category: "bar", filename: "a.pdf", result: {}, score: {} }];
    const started = uploadFlowReducer(initialUploadState, { type: "REVIEW_ROWS_LOAD_START" });
    const next = uploadFlowReducer(started, { type: "REVIEW_ROWS_LOAD_SUCCESS", rows });
    expect(next.reviewRowsLoading).toBe(false);
    expect(next.reviewRows).toHaveLength(1);
  });

  it("marks report action consumed only when report status is reported", () => {
    const state = {
      ...initialUploadState,
      reportTypeErrorConsumed: false,
    };
    const skipped = uploadFlowReducer(state, { type: "REPORT_TYPE_ERROR_SUCCESS", payload: { status: "skipped" } });
    const reported = uploadFlowReducer(state, { type: "REPORT_TYPE_ERROR_SUCCESS", payload: { status: "reported" } });
    expect(skipped.reportTypeErrorConsumed).toBe(false);
    expect(reported.reportTypeErrorConsumed).toBe(true);
  });

  it("resets report consumed flag after each successful review submit", () => {
    const state = {
      ...initialUploadState,
      batch: { batch_id: "b1", status: "review_ready", review_rows_count: 1 },
      reportTypeErrorConsumed: true,
    };
    const next = uploadFlowReducer(state, {
      type: "REVIEW_SUBMIT_SUCCESS",
      batch: { batch_id: "b1", status: "review_ready", review_rows_count: 2 },
    });
    expect(next.reportTypeErrorConsumed).toBe(false);
  });

  it("keeps current phase on poll failure and only stores system error", () => {
    const state = {
      ...initialUploadState,
      phase: "tracking",
      systemError: "",
    };
    const next = uploadFlowReducer(state, {
      type: "POLL_FAILURE",
      message: "network down",
    });
    expect(next.phase).toBe("tracking");
    expect(next.systemError).toBe("network down");
  });
});
