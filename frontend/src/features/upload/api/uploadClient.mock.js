import {
  parseBatchListResponse,
  parseBatchResponse,
  parseCreateBatchRequest,
  parseMergeRequest,
  parseMergeTaskResponse,
  parseSubmitReviewRequest,
} from "../../../contracts/v1.schema";

const store = new Map();

/**
 * Build a deterministic mock client for frontend-only workflow testing.
 * @param {{ latencyMs?: number }} [options]
 */
export function createMockUploadClient(options = {}) {
  const latencyMs = options.latencyMs ?? 80;

  return {
    mode: "mock",

    /**
     * Simulate upload path generation.
     * @param {File[]} files
     * @param {{ batchType: "daily" | "office" }} context
     */
    async uploadFiles(files, context) {
      await wait(latencyMs);
      const defaultCategory = context.batchType === "daily" ? "bar" : "office";
      return files.map((file) => ({
        path: `mock://uploads/${Date.now()}-${safeName(file.name)}`,
        category: defaultCategory,
      }));
    },

    /**
     * @param {unknown} payload
     */
    async createBatch(payload) {
      const body = parseCreateBatchRequest(payload);
      await wait(latencyMs);

      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const record = {
        schema_version: "v1",
        batch_id: id,
        type: body.type,
        status: "queued",
        run_date: body.run_date,
        inputs: body.inputs.map((i) => ({ ...i, status: "queued" })),
        artifacts: {},
        review_rows_count: 0,
        merge_output: {},
        error: null,
        created_at: now,
        updated_at: now,
        __ticks: 0,
        __mergeRequested: false,
      };
      store.set(id, record);
      return parseBatchResponse(cleanRecord(record));
    },

    /**
     * @param {string} batchId
     */
    async getBatch(batchId) {
      await wait(latencyMs);
      const record = store.get(batchId);
      if (!record) {
        throw new Error(`Batch ${batchId} not found in mock store.`);
      }
      record.__ticks += 1;

      if (record.__mergeRequested) {
        if (record.__ticks > 4) {
          record.status = "merged";
          record.merge_output = {
            output_path: "outputs/monthly/current.xlsx",
            rows_written: record.inputs.length,
            merge_mode: "overwrite",
          };
        } else {
          record.status = "merging";
        }
      } else {
        advanceInputStatuses(record);
        const allExtracted = record.inputs.every((i) => i.status === "extracted");
        record.status = allExtracted ? "review_ready" : "running";
      }

      record.updated_at = new Date().toISOString();
      return parseBatchResponse(cleanRecord(record));
    },

    /**
     * @param {number} [limit]
     */
    async listBatches(limit = 100) {
      await wait(latencyMs);
      const items = [...store.values()].slice(0, limit).map((entry) => parseBatchResponse(cleanRecord(entry)));
      return parseBatchListResponse({ schema_version: "v1", total: items.length, items });
    },

    /**
     * @param {string} batchId
     * @param {unknown} payload
     */
    async submitReview(batchId, payload) {
      const body = parseSubmitReviewRequest(payload);
      await wait(latencyMs);

      const record = store.get(batchId);
      if (!record) {
        throw new Error(`Batch ${batchId} not found in mock store.`);
      }

      record.review_rows_count = body.rows.length;
      record.status = "review_ready";
      record.updated_at = new Date().toISOString();

      return parseBatchResponse(cleanRecord(record));
    },

    /**
     * @param {string} batchId
     * @param {unknown} payload
     */
    async queueMerge(batchId, payload) {
      parseMergeRequest(payload);
      await wait(latencyMs);

      const record = store.get(batchId);
      if (!record) {
        throw new Error(`Batch ${batchId} not found in mock store.`);
      }

      record.__mergeRequested = true;
      record.__ticks = 2;
      record.status = "merging";
      record.updated_at = new Date().toISOString();

      return parseMergeTaskResponse({
        schema_version: "v1",
        task_id: crypto.randomUUID(),
        batch_id: batchId,
        task_type: "merge_batch",
        created_at: new Date().toISOString(),
      });
    },

    /**
     * Return generated review rows for manual review page.
     * @param {string} batchId
     */
    async getReviewRows(batchId) {
      await wait(latencyMs);
      const record = store.get(batchId);
      if (!record) {
        throw new Error(`Batch ${batchId} not found in mock store.`);
      }

      const rows = record.inputs.map((input, index) => ({
        row_id: `row-${String(index + 1).padStart(4, "0")}`,
        category: input.category || "office",
        filename: fileNameFromPath(input.path),
        result: { run_date: record.run_date || "-" },
        score: {},
        preview_url: "",
      }));

      return { rows };
    },

    /**
     * Simulate local merge source upload endpoint.
     * @param {string} _batchId
     * @param {File} file
     */
    async uploadMergeSourceLocal(_batchId, file) {
      await wait(latencyMs);
      return { monthly_excel_path: `mock://merge-source/${safeName(file.name)}` };
    },

    /**
     * Simulate report-error action in frontend-only mode.
     * @param {string} batchId
     */
    async reportTypeError(batchId) {
      await wait(latencyMs);
      const record = store.get(batchId);
      if (!record) {
        throw new Error(`Batch ${batchId} not found in mock store.`);
      }
      return {
        schema_version: "v1",
        status: "skipped",
        corrections: [],
      };
    },

    /**
     * Return static office receiver options for frontend-only testing.
     */
    async getOfficeReceiverOptions() {
      await wait(latencyMs);
      return {
        default_city: "Dortmund",
        options: [
          {
            city: "Dortmund",
            receiver_name: "Ramen Ippin Dortmund GmbH",
            receiver_address: "Reinoldistr.8 44135 Dortmund",
          },
        ],
      };
    },
  };
}

/**
 * Normalize mock records into public response shape.
 * @param {Record<string, unknown>} record
 */
function cleanRecord(record) {
  const cloned = { ...record };
  delete cloned.__ticks;
  delete cloned.__mergeRequested;
  return cloned;
}

/**
 * Simulate network latency.
 * @param {number} ms
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sanitize file names for virtual upload paths.
 * @param {string} value
 */
function safeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Read tail file name from an input path string.
 * @param {string} path
 */
function fileNameFromPath(path) {
  const normalized = String(path || "").replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "unknown.pdf";
}

/**
 * Advance per-file status one step at a time to simulate progressive extraction.
 * Each poll tick advances ONE file: queued -> processing -> extracted.
 * @param {{ inputs: Array<Record<string, unknown>> }} record
 */
function advanceInputStatuses(record) {
  for (const input of record.inputs) {
    if (!input.status || input.status === "queued") {
      input.status = "processing";
      return;
    }
    if (input.status === "processing") {
      input.status = "extracted";
      return;
    }
  }
}
