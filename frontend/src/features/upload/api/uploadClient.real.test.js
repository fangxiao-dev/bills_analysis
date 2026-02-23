import { describe, expect, it, vi } from "vitest";
import { createRealUploadClient } from "./uploadClient.real";
import { toErrorMessage } from "../../../lib/http";

describe("uploadClient.real", () => {
  it("calls create batch endpoint with POST", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          schema_version: "v1",
          batch_id: "b-1",
          type: "daily",
          status: "queued",
          run_date: "04/02/2026",
          inputs: [{ path: "a.pdf", category: "bar" }],
          artifacts: {},
          review_rows_count: 0,
          merge_output: {},
          error: null,
          created_at: "2026-02-08T00:00:00Z",
          updated_at: "2026-02-08T00:00:00Z",
        }),
    });

    const client = createRealUploadClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });
    await client.createBatch({
      type: "daily",
      run_date: "04/02/2026",
      inputs: [{ path: "a.pdf", category: "bar" }],
      metadata: {},
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/batches",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("calls multipart upload endpoint with expected form fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          schema_version: "v1",
          task_id: "t-1",
          batch_id: "b-1",
          type: "daily",
          status: "queued",
          created_at: "2026-02-08T00:00:00Z",
        }),
    });

    const client = createRealUploadClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });
    const zbon = new File(["zbon"], "zbon.pdf", { type: "application/pdf" });
    const bar = new File(["bar"], "bar.pdf", { type: "application/pdf" });

    await client.createBatchUpload({
      files: [
        { file: zbon, category: "zbon", name: "zbon.pdf" },
        { file: bar, category: "bar", name: "bar.pdf" },
      ],
      batchType: "daily",
      runDate: "04/02/2026",
      metadata: {},
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/batches/upload",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
  });

  it("maps 422 style responses to thrown errors", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => JSON.stringify({ detail: "Validation Error" }),
    });

    const client = createRealUploadClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });

    await expect(
      client.createBatch({
        type: "daily",
        run_date: "04/02/2026",
        inputs: [{ path: "a.pdf", category: "bar" }],
      }),
    ).rejects.toBeTruthy();
  });

  it("keeps FastAPI detail list for readable 422 validation feedback", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () =>
        JSON.stringify({
          detail: [
            {
              type: "missing",
              loc: ["body", "rows", 0, "result", "brutto"],
              msg: "Field required",
            },
          ],
        }),
    });

    const client = createRealUploadClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });

    try {
      await client.createBatch({
        type: "daily",
        run_date: "04/02/2026",
        inputs: [{ path: "a.pdf", category: "bar" }],
      });
      throw new Error("Expected createBatch to throw.");
    } catch (error) {
      expect(toErrorMessage(error)).toContain("body.rows.0.result.brutto: Field required");
    }
  });

  it("fetches review rows payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          rows: [{ row_id: "row-0001", category: "bar", filename: "a.pdf", result: {}, score: {} }],
        }),
    });
    const client = createRealUploadClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });
    const payload = await client.getReviewRows("b-1");
    expect(payload.rows).toHaveLength(1);
  });

  it("uploads local merge source excel", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ monthly_excel_path: "outputs/monthly/current.xlsx" }),
    });
    const client = createRealUploadClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });
    const file = new File(["xlsx"], "monthly.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    const payload = await client.uploadMergeSourceLocal("b-1", file);
    expect(payload.monthly_excel_path).toContain("outputs/monthly/current.xlsx");
  });

  it("calls report-error endpoint and returns correction summary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          schema_version: "v1",
          status: "reported",
          corrections: [
            {
              row_id: "row-0001",
              filename: "office.pdf",
              original_type: "Service&Andere",
              corrected_type: "Miete",
            },
          ],
        }),
    });
    const client = createRealUploadClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });

    const payload = await client.reportTypeError("b-1");
    expect(payload.status).toBe("reported");
    expect(payload.corrections).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/batches/b-1/report-error",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("loads office receiver options from dedicated endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          schema_version: "v1",
          default_city: "Dortmund",
          options: [
            {
              city: "Dortmund",
              receiver_name: "Ramen Ippin Dortmund GmbH",
              receiver_address: "Reinoldistr.8 44135 Dortmund",
            },
          ],
        }),
    });
    const client = createRealUploadClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });

    const payload = await client.getOfficeReceiverOptions();
    expect(payload.default_city).toBe("Dortmund");
    expect(payload.options).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/batches/office-receiver-options",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
