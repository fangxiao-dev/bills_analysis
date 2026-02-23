import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createMockUploadClient } from "../api/uploadClient.mock";
import { useUploadFlow } from "./useUploadFlow";
import { AppHttpError } from "../../../lib/http";

describe("useUploadFlow", () => {
  it("prefers cached office receiver city over backend default when valid", async () => {
    window.localStorage.setItem("upload.office_receiver_city", "Essen");
    const client = createMockUploadClient({ latencyMs: 0 });
    client.getOfficeReceiverOptions = vi.fn(async () => ({
      default_city: "Dortmund",
      options: [
        {
          city: "Dortmund",
          receiver_name: "Ramen Ippin Dortmund GmbH",
          receiver_address: "Reinoldistr.8 44135 Dortmund",
        },
        {
          city: "Essen",
          receiver_name: "Ramen Ippin Essen GmbH",
          receiver_address: "Demo Str. 1 45127 Essen",
        },
      ],
    }));

    const { result } = renderHook(() => useUploadFlow({ client }));
    act(() => {
      result.current.actions.setBatchType("office");
    });
    await act(async () => {
      await result.current.actions.fetchOfficeReceiverOptions();
    });

    expect(result.current.state.officeReceiverCity).toBe("Essen");
  });

  it("persists office receiver city when user changes selection", () => {
    window.localStorage.removeItem("upload.office_receiver_city");
    const client = createMockUploadClient({ latencyMs: 0 });
    const { result } = renderHook(() => useUploadFlow({ client }));

    act(() => {
      result.current.actions.setOfficeReceiverCity("Dortmund");
    });
    expect(window.localStorage.getItem("upload.office_receiver_city")).toBe("Dortmund");
  });

  it("rejects non-PDF files during addFiles", () => {
    const client = createMockUploadClient({ latencyMs: 0 });
    const { result } = renderHook(() => useUploadFlow({ client }));

    const txt = new File(["x"], "notes.txt", { type: "text/plain" });
    act(() => {
      result.current.actions.addFiles([txt]);
    });

    expect(result.current.state.files).toHaveLength(0);
    expect(result.current.state.rejectedMessage).toMatch(/Ignored non-PDF files/i);
  });

  it("accepts only one ZBON file", () => {
    const client = createMockUploadClient({ latencyMs: 0 });
    const { result } = renderHook(() => useUploadFlow({ client }));

    const first = new File(["a"], "zbon-1.pdf", { type: "application/pdf" });
    const second = new File(["b"], "zbon-2.pdf", { type: "application/pdf" });

    act(() => {
      result.current.actions.addFiles([first], "zbon");
    });
    act(() => {
      result.current.actions.addFiles([second], "zbon");
    });

    const zbonFiles = result.current.state.files.filter((file) => file.category === "zbon");
    expect(zbonFiles).toHaveLength(1);
    expect(result.current.state.rejectedMessage).toMatch(/ZBON allows only one file/i);
  });

  it("submits review only without auto-merging", async () => {
    const client = createMockUploadClient({ latencyMs: 0 });
    const { result } = renderHook(() => useUploadFlow({ client }));

    const file = new File(["a"], "invoice.pdf", { type: "application/pdf" });
    act(() => {
      result.current.actions.addFiles([file], "bar");
    });
    await act(async () => {
      await result.current.actions.submitBatch();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe("tracking");
    });

    let ok;
    await act(async () => {
      ok = await result.current.actions.submitReviewOnly([
        {
          row_id: "bar:invoice.pdf:0",
          category: "bar",
          filename: "invoice.pdf",
          result: { brutto: "10.5" },
          score: {},
        },
      ]);
    });
    expect(ok).toBe(true);
    expect(result.current.state.phase).toBe("review_ready");
    expect(result.current.state.reviewSubmitted).toBe(true);
    expect(result.current.state.mergeRequested).toBe(false);
  });

  it("queues merge only after review and reaches done", async () => {
    const client = createMockUploadClient({ latencyMs: 0 });
    const { result } = renderHook(() => useUploadFlow({ client }));

    const file = new File(["a"], "invoice.pdf", { type: "application/pdf" });
    act(() => {
      result.current.actions.addFiles([file], "bar");
    });
    await act(async () => {
      await result.current.actions.submitBatch();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe("tracking");
    });

    await act(async () => {
      await result.current.actions.submitReviewOnly([
        {
          row_id: "bar:invoice.pdf:0",
          category: "bar",
          filename: "invoice.pdf",
          result: { brutto: "10.5" },
          score: {},
        },
      ]);
    });
    let mergeOk;
    await act(async () => {
      mergeOk = await result.current.actions.queueMergeOnly({ mode: "overwrite", monthly_excel_path: null });
    });
    expect(mergeOk).toBe(true);

    await waitFor(
      () => {
        expect(result.current.state.phase).toBe("done");
      },
      { timeout: 8000 },
    );
  });

  it("blocks retry merge when batch is not failed", async () => {
    const client = createMockUploadClient({ latencyMs: 0 });
    const { result } = renderHook(() => useUploadFlow({ client }));

    const file = new File(["a"], "invoice.pdf", { type: "application/pdf" });
    act(() => {
      result.current.actions.addFiles([file], "bar");
    });
    await act(async () => {
      await result.current.actions.submitBatch();
    });

    await waitFor(() => {
      expect(result.current.state.phase).toBe("tracking");
    });

    let ok;
    await act(async () => {
      ok = await result.current.actions.retryMerge();
    });
    expect(ok).toBe(false);
    expect(result.current.state.systemError).toMatch(/failed/i);
  });

  it("uses createBatchUpload when available", async () => {
    const queuedBatch = {
      schema_version: "v1",
      batch_id: "b-upload",
      type: "daily",
      status: "queued",
      run_date: "10/02/2026",
      inputs: [{ path: "outputs/webapp/uploads/x/zbon/01_zbon.pdf", category: "zbon" }],
      artifacts: {},
      review_rows_count: 0,
      merge_output: {},
      error: null,
      created_at: "2026-02-10T00:00:00Z",
      updated_at: "2026-02-10T00:00:00Z",
    };

    const client = {
      mode: "real",
      uploadFiles: vi.fn(),
      createBatch: vi.fn(),
      createBatchUpload: vi.fn(async () => ({ batch_id: "b-upload" })),
      getBatch: vi.fn(async () => queuedBatch),
      listBatches: vi.fn(async () => ({ schema_version: "v1", total: 1, items: [queuedBatch] })),
      submitReview: vi.fn(async () => ({ ...queuedBatch, status: "review_ready" })),
      queueMerge: vi.fn(async () => ({ schema_version: "v1", task_id: "t-1", batch_id: "b-upload", task_type: "merge_batch", created_at: "2026-02-10T00:00:00Z" })),
    };

    const { result } = renderHook(() => useUploadFlow({ client }));
    act(() => {
      result.current.actions.setRunDate("10/02/2026");
      result.current.actions.addFiles([new File(["zbon"], "zbon.pdf", { type: "application/pdf" })], "zbon");
    });
    let ok;
    await act(async () => {
      ok = await result.current.actions.submitBatch();
    });

    expect(ok).toBe(true);
    expect(client.createBatchUpload).toHaveBeenCalledTimes(1);
    expect(client.createBatch).not.toHaveBeenCalled();
    expect(client.uploadFiles).not.toHaveBeenCalled();
  });

  it("submits office batch with office_receiver_city in metadata", async () => {
    const queuedBatch = {
      schema_version: "v1",
      batch_id: "b-office-upload",
      type: "office",
      status: "queued",
      run_date: "10/02/2026",
      inputs: [{ path: "outputs/webapp/uploads/x/office/01_office.pdf", category: "office" }],
      artifacts: {},
      review_rows_count: 0,
      merge_output: {},
      error: null,
      created_at: "2026-02-10T00:00:00Z",
      updated_at: "2026-02-10T00:00:00Z",
    };

    const client = {
      mode: "real",
      uploadFiles: vi.fn(),
      createBatch: vi.fn(),
      createBatchUpload: vi.fn(async () => ({ batch_id: "b-office-upload" })),
      getBatch: vi.fn(async () => queuedBatch),
      listBatches: vi.fn(async () => ({ schema_version: "v1", total: 1, items: [queuedBatch] })),
      submitReview: vi.fn(async () => ({ ...queuedBatch, status: "review_ready" })),
      queueMerge: vi.fn(async () => ({ schema_version: "v1", task_id: "t-1", batch_id: "b-office-upload", task_type: "merge_batch", created_at: "2026-02-10T00:00:00Z" })),
      getOfficeReceiverOptions: vi.fn(async () => ({
        default_city: "Dortmund",
        options: [
          {
            city: "Dortmund",
            receiver_name: "Ramen Ippin Dortmund GmbH",
            receiver_address: "Reinoldistr.8 44135 Dortmund",
          },
        ],
      })),
    };

    const { result } = renderHook(() => useUploadFlow({ client }));
    act(() => {
      result.current.actions.setBatchType("office");
      result.current.actions.setRunDate("10/02/2026");
      result.current.actions.addFiles([new File(["office"], "office.pdf", { type: "application/pdf" })], "office");
    });
    await act(async () => {
      await result.current.actions.fetchOfficeReceiverOptions();
    });

    let ok;
    await act(async () => {
      ok = await result.current.actions.submitBatch();
    });
    expect(ok).toBe(true);
    expect(client.createBatchUpload).toHaveBeenCalledTimes(1);
    expect(client.createBatchUpload.mock.calls[0][0].metadata.office_receiver_city).toBe("Dortmund");
  });

  it("exposes readable 422 validation details on review submit failure", async () => {
    const batch = {
      schema_version: "v1",
      batch_id: "b-422",
      type: "daily",
      status: "review_ready",
      run_date: "10/02/2026",
      inputs: [{ path: "outputs/webapp/uploads/x/bar/01.pdf", category: "bar" }],
      artifacts: {},
      review_rows_count: 0,
      merge_output: {},
      error: null,
      created_at: "2026-02-10T00:00:00Z",
      updated_at: "2026-02-10T00:00:00Z",
    };

    const client = {
      mode: "real",
      uploadFiles: vi.fn(),
      createBatchUpload: vi.fn(async () => ({ batch_id: "b-422" })),
      createBatch: vi.fn(),
      getBatch: vi.fn(async () => batch),
      listBatches: vi.fn(async () => ({ schema_version: "v1", total: 1, items: [batch] })),
      submitReview: vi.fn(async () => {
        throw new AppHttpError("Request failed with status 422.", {
          status: 422,
          details: {
            detail: [
              {
                type: "missing",
                loc: ["body", "rows", 0, "result", "brutto"],
                msg: "Field required",
              },
            ],
          },
        });
      }),
      queueMerge: vi.fn(),
    };

    const { result } = renderHook(() => useUploadFlow({ client }));
    act(() => {
      result.current.actions.addFiles([new File(["bar"], "bar.pdf", { type: "application/pdf" })], "bar");
    });

    await act(async () => {
      await result.current.actions.submitBatch();
    });

    let ok;
    await act(async () => {
      ok = await result.current.actions.submitReviewOnly([
        {
          row_id: "bar:bar.pdf:0",
          category: "bar",
          filename: "bar.pdf",
          result: {},
          score: {},
        },
      ]);
    });

    expect(ok).toBe(false);
    expect(result.current.state.systemError).toContain("body.rows.0.result.brutto: Field required");
  });

  it("recovers batch after create upload timeout by listing recent batches", async () => {
    const nowIso = new Date().toISOString();
    let recoveredBatch = null;

    const client = {
      mode: "real",
      uploadFiles: vi.fn(),
      createBatchUpload: vi.fn(async () => {
        throw new AppHttpError("Request timed out.");
      }),
      createBatch: vi.fn(),
      getBatch: vi.fn(async () => recoveredBatch),
      listBatches: vi.fn(async () => ({ schema_version: "v1", total: 1, items: [recoveredBatch] })),
      submitReview: vi.fn(),
      queueMerge: vi.fn(),
    };

    const { result } = renderHook(() => useUploadFlow({ client }));
    act(() => {
      recoveredBatch = {
        schema_version: "v1",
        batch_id: "b-recovered",
        type: "daily",
        status: "queued",
        run_date: result.current.state.runDate,
        inputs: [{ path: "outputs/webapp/uploads/x/zbon/01_zbon.pdf", category: "zbon" }],
        artifacts: {},
        review_rows_count: 0,
        merge_output: {},
        error: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      result.current.actions.addFiles([new File(["zbon"], "zbon.pdf", { type: "application/pdf" })], "zbon");
    });

    let ok;
    await act(async () => {
      ok = await result.current.actions.submitBatch();
    });

    expect(ok).toBe(true);
    expect(client.listBatches).toHaveBeenCalled();
    expect(result.current.state.batch?.batch_id).toBe("b-recovered");
    expect(result.current.state.phase).toBe("tracking");
  });

  it("reports office type error for current batch via client action", async () => {
    const client = createMockUploadClient({ latencyMs: 0 });
    client.reportTypeError = vi.fn(async () => ({
      status: "reported",
      corrections: [
        {
          row_id: "row-0001",
          filename: "office.pdf",
          original_type: "Service&Andere",
          corrected_type: "Miete",
        },
      ],
    }));

    const { result } = renderHook(() => useUploadFlow({ client }));
    act(() => {
      result.current.actions.setBatchType("office");
      result.current.actions.addFiles([new File(["office"], "office.pdf", { type: "application/pdf" })], "office");
    });
    await act(async () => {
      await result.current.actions.submitBatch();
    });

    await waitFor(() => {
      expect(result.current.state.batch?.batch_id).toBeTruthy();
    });

    let payload;
    await act(async () => {
      payload = await result.current.actions.reportTypeError();
    });
    expect(payload.status).toBe("reported");
    expect(payload.corrections).toHaveLength(1);
    expect(client.reportTypeError).toHaveBeenCalledWith(result.current.state.batch.batch_id);
  });

  it("consumes report action after reported and resets after re-submit", async () => {
    const client = createMockUploadClient({ latencyMs: 0 });
    client.reportTypeError = vi.fn(async () => ({
      status: "reported",
      corrections: [{ row_id: "row-0001", filename: "office.pdf", original_type: "A", corrected_type: "B" }],
    }));

    const { result } = renderHook(() => useUploadFlow({ client }));
    act(() => {
      result.current.actions.setBatchType("office");
      result.current.actions.addFiles([new File(["office"], "office.pdf", { type: "application/pdf" })], "office");
    });
    await act(async () => {
      await result.current.actions.submitBatch();
    });
    await waitFor(() => {
      expect(result.current.state.batch?.batch_id).toBeTruthy();
    });

    await act(async () => {
      await result.current.actions.submitReviewOnly([
        {
          row_id: "office:office.pdf:0",
          category: "office",
          filename: "office.pdf",
          result: { type: "A", brutto: "1" },
          score: {},
        },
      ]);
    });
    expect(result.current.state.reportTypeErrorConsumed).toBe(false);

    await act(async () => {
      await result.current.actions.reportTypeError();
    });
    expect(result.current.state.reportTypeErrorConsumed).toBe(true);

    await act(async () => {
      await result.current.actions.submitReviewOnly([
        {
          row_id: "office:office.pdf:0",
          category: "office",
          filename: "office.pdf",
          result: { type: "B", brutto: "1" },
          score: {},
        },
      ]);
    });
    expect(result.current.state.reportTypeErrorConsumed).toBe(false);
  });

  it("keeps options empty when office receiver options response is empty", async () => {
    const client = createMockUploadClient({ latencyMs: 0 });
    client.getOfficeReceiverOptions = vi.fn(async () => ({
      default_city: "",
      options: [],
    }));

    const { result } = renderHook(() => useUploadFlow({ client }));
    act(() => {
      result.current.actions.setBatchType("office");
    });

    await act(async () => {
      await result.current.actions.fetchOfficeReceiverOptions();
    });

    expect(result.current.state.officeReceiverOptions).toHaveLength(0);
    expect(result.current.state.officeReceiverCity).toBe("");
  });
});
