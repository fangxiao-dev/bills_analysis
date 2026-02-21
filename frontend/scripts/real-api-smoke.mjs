import path from "node:path";

const API_BASE_URL = process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || "http://127.0.0.1:8000";
const RUN_DATE = process.env.SMOKE_RUN_DATE || formatRunDate(new Date());
const REVIEW_READY_TIMEOUT_MS = Number(process.env.SMOKE_REVIEW_TIMEOUT_MS || 120000);
const MERGE_TIMEOUT_MS = Number(process.env.SMOKE_MERGE_TIMEOUT_MS || 120000);
const POLL_INTERVAL_MS = Number(process.env.SMOKE_POLL_INTERVAL_MS || 2000);
const STUCK_STATUS_TIMEOUT_MS = Number(process.env.SMOKE_STUCK_STATUS_TIMEOUT_MS || 45000);
const STATUS_LOG_INTERVAL_MS = Number(process.env.SMOKE_STATUS_LOG_INTERVAL_MS || 10000);
const DEFAULT_DAILY_EXCEL_PATH = path.resolve(process.cwd(), "..", "data", "daily_excel_sample.xlsx");
const DEFAULT_OFFICE_EXCEL_PATH = path.resolve(process.cwd(), "..", "data", "monthly_excel_sample.xlsx");
const DAILY_MERGE_EXCEL_PATH = process.env.SMOKE_DAILY_EXCEL_PATH || DEFAULT_DAILY_EXCEL_PATH;
const OFFICE_MERGE_EXCEL_PATH = process.env.SMOKE_OFFICE_EXCEL_PATH || DEFAULT_OFFICE_EXCEL_PATH;
const DAILY_ZBON_FILE = process.env.SMOKE_DAILY_ZBON_FILE || "";
const DAILY_BAR_FILE = process.env.SMOKE_DAILY_BAR_FILE || "";
const OFFICE_APPEND_FILE = process.env.SMOKE_OFFICE_APPEND_FILE || "";
const OFFICE_OVERWRITE_FILE = process.env.SMOKE_OFFICE_OVERWRITE_FILE || "";

/**
 * Execute all smoke scenarios sequentially and print summary.
 */
async function main() {
  console.log(`[smoke] baseUrl=${API_BASE_URL} runDate=${RUN_DATE}`);
  const healthy = await checkHealth();
  if (!healthy) {
    throw new Error(`Health check failed at ${API_BASE_URL}/healthz. Ensure backend is running.`);
  }

  const reports = [];
  reports.push(await runDailyCase());
  reports.push(await runOfficeCase("append"));
  reports.push(await runOfficeCase("overwrite"));

  console.log("\n[smoke] summary");
  for (const report of reports) {
    const status = report.ok ? "PASS" : "FAIL";
    console.log(`- ${status} ${report.name}: ${report.message}`);
  }

  const failures = reports.filter((report) => !report.ok);
  if (failures.length) {
    process.exitCode = 1;
  }
}

/**
 * Run one daily upload -> review -> merge flow.
 */
async function runDailyCase() {
  const zbon = await buildPdfUploadInput("daily-zbon.pdf", DAILY_ZBON_FILE);
  const bar = await buildPdfUploadInput("daily-bar.pdf", DAILY_BAR_FILE);
  return runFlowCase({
    name: "daily-overwrite",
    batchType: "daily",
    mergeMode: "overwrite",
    files: [
      { file: zbon.file, category: "zbon", name: zbon.name },
      { file: bar.file, category: "bar", name: bar.name },
    ],
  });
}

/**
 * Run one office upload -> review -> merge flow with selected merge mode.
 * @param {"append" | "overwrite"} mergeMode
 */
async function runOfficeCase(mergeMode) {
  const sourcePath = mergeMode === "append" ? OFFICE_APPEND_FILE : OFFICE_OVERWRITE_FILE;
  const office = await buildPdfUploadInput(`office-${mergeMode}.pdf`, sourcePath);
  return runFlowCase({
    name: `office-${mergeMode}`,
    batchType: "office",
    mergeMode,
    files: [{ file: office.file, category: "office", name: office.name }],
  });
}

/**
 * Execute one end-to-end flow and return a report record.
 * @param {{
 *  name: string;
 *  batchType: "daily" | "office";
 *  mergeMode: "append" | "overwrite";
 *  files: Array<{ file: File; category: "bar" | "zbon" | "office" | null; name: string }>;
 * }} params
 */
async function runFlowCase(params) {
  const { name, batchType, mergeMode, files } = params;
  const mergeExcelPath = batchType === "daily" ? DAILY_MERGE_EXCEL_PATH : OFFICE_MERGE_EXCEL_PATH;
  console.log(`\n[smoke] start ${name}`);
  console.log(`[smoke] ${name} merge_excel=${mergeExcelPath}`);
  let batchId = "";

  try {
    const createTask = await client.createBatchUpload({
      files,
      batchType,
      runDate: RUN_DATE,
      metadata: {
        source: "frontend_smoke",
        smoke_case: name,
      },
    });
    batchId = createTask.batch_id;
    console.log(`[smoke] ${name} created batch=${batchId}`);

    const reviewBatch = await waitForStatus(batchId, ["review_ready"], REVIEW_READY_TIMEOUT_MS);
    console.log(`[smoke] ${name} reached status=${reviewBatch.status}`);

    const reviewRowsRaw = await loadReviewRows(batchId);
    const reviewRows = buildCanonicalReviewRows(reviewRowsRaw, files);
    if (!reviewRows.length) {
      throw new Error("No review rows available for submit.");
    }

    await client.submitReview(batchId, { rows: reviewRows });
    console.log(`[smoke] ${name} review submitted rows=${reviewRows.length}`);

    const mergeTask = await client.queueMerge(batchId, {
      mode: mergeMode,
      monthly_excel_path: mergeExcelPath,
      metadata: { source: "frontend_smoke", smoke_case: name },
    });
    console.log(`[smoke] ${name} merge queued task=${mergeTask.task_id} mode=${mergeMode}`);

    const terminalBatch = await waitForStatus(batchId, ["merged", "failed"], MERGE_TIMEOUT_MS);
    const ok = terminalBatch.status === "merged";
    const message = ok
      ? `merged (batch=${batchId}, task=${mergeTask.task_id})`
      : `failed with backend status=failed (batch=${batchId}, task=${mergeTask.task_id})`;
    return { name, ok, message };
  } catch (error) {
    const readable = toErrorMessage(error);
    return {
      name,
      ok: false,
      message: `${readable}${batchId ? ` (batch=${batchId})` : ""}`,
    };
  }
}

/**
 * Poll batch status until expected status appears or timeout reaches.
 * @param {string} batchId
 * @param {Array<"review_ready" | "merged" | "failed">} expected
 * @param {number} timeoutMs
 */
async function waitForStatus(batchId, expected, timeoutMs) {
  const startedAt = Date.now();
  let lastStatus = "";
  let lastStatusChangedAt = startedAt;
  let lastLoggedAt = 0;

  while (Date.now() - startedAt < timeoutMs) {
    const batch = await client.getBatch(batchId);

    if (batch.status !== lastStatus) {
      lastStatus = batch.status;
      lastStatusChangedAt = Date.now();
      console.log(`[smoke] batch=${batchId} status=${batch.status}`);
    } else if (Date.now() - lastLoggedAt >= STATUS_LOG_INTERVAL_MS) {
      const stableFor = Math.floor((Date.now() - lastStatusChangedAt) / 1000);
      console.log(`[smoke] batch=${batchId} still ${batch.status} (${stableFor}s)`);
      lastLoggedAt = Date.now();
    }

    if (expected.includes(batch.status)) {
      return batch;
    }

    if (batch.status === "failed" && !expected.includes("failed")) {
      const reason = readBatchFailureReason(batch);
      throw new Error(`Batch failed before reaching [${expected.join(", ")}]: ${reason}`);
    }

    if (Date.now() - lastStatusChangedAt >= STUCK_STATUS_TIMEOUT_MS) {
      throw new Error(
        `Status stuck at ${batch.status} for ${Math.floor(STUCK_STATUS_TIMEOUT_MS / 1000)}s (batch=${batchId}). Check worker/queue.`,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Timeout waiting for [${expected.join(", ")}] on batch=${batchId}.`);
}

/**
 * Fetch review rows and support both object and array envelopes.
 * @param {string} batchId
 */
async function loadReviewRows(batchId) {
  const payload = await client.getReviewRows(batchId);
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === "object" && Array.isArray(payload.rows)) {
    return payload.rows;
  }
  return [];
}

/**
 * Normalize backend review rows into canonical nested payload shape.
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<{ category: "bar" | "zbon" | "office" | null; name: string }>} files
 */
function buildCanonicalReviewRows(rows, files) {
  if (rows.length) {
    return rows
      .map((row, index) => {
        const fallbackFile = files[index % files.length];
        const category = normalizeCategory(row.category, fallbackFile?.category);
        const filename = normalizeText(row.filename, fallbackFile?.name || "");
        if (!category || !filename) {
          return null;
        }

        const payload = {
          row_id: normalizeText(row.row_id, `${category}:${filename}:${index}`),
          category,
          filename,
          result: row.result && typeof row.result === "object" ? row.result : {},
          score: row.score && typeof row.score === "object" ? row.score : {},
        };
        const previewPath = normalizeText(row.preview_path, "");
        if (previewPath) {
          payload.preview_path = previewPath;
        }
        return payload;
      })
      .filter(Boolean);
  }

  return files
    .map((file, index) => {
      const category = normalizeCategory(file.category, null);
      if (!category) {
        return null;
      }
      return {
        row_id: `${category}:${file.name}:${index}`,
        category,
        filename: file.name,
        result: {},
        score: {},
      };
    })
    .filter(Boolean);
}

/**
 * Run backend health check.
 */
async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/healthz`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Thin API client for smoke script, independent from Vite module resolution.
 */
const client = {
  async createBatchUpload(payload) {
    const body = buildUploadFormData(payload);
    return requestJson("/v1/batches/upload", { method: "POST", body });
  },
  async getBatch(batchId) {
    return requestJson(`/v1/batches/${batchId}`, { method: "GET" });
  },
  async getReviewRows(batchId) {
    return requestJson(`/v1/batches/${batchId}/review-rows`, { method: "GET" });
  },
  async submitReview(batchId, payload) {
    return requestJson(`/v1/batches/${batchId}/review`, { method: "PUT", body: payload });
  },
  async queueMerge(batchId, payload) {
    return requestJson(`/v1/batches/${batchId}/merge`, { method: "POST", body: payload });
  },
};

/**
 * Send JSON or multipart request and throw typed error on failure.
 * @param {string} path
 * @param {{ method: string; body?: unknown }} params
 */
async function requestJson(path, params) {
  const isFormData = typeof FormData !== "undefined" && params.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: params.method,
    headers: isFormData ? {} : { "Content-Type": "application/json" },
    body: params.body === undefined ? undefined : isFormData ? params.body : JSON.stringify(params.body),
  });

  const text = await response.text();
  const payload = safeParseJson(text);
  if (!response.ok) {
    const error = new Error(`Request failed with status ${response.status}.`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

/**
 * Build multipart upload payload for backend /v1/batches/upload.
 * @param {{
 *  files: Array<{ file: File; category: "bar" | "zbon" | "office" | null; name: string }>;
 *  batchType: "daily" | "office";
 *  runDate: string | null;
 *  metadata?: Record<string, unknown>;
 * }} payload
 */
function buildUploadFormData(payload) {
  const formData = new FormData();
  formData.set("type", payload.batchType);
  if (payload.runDate) {
    formData.set("run_date", payload.runDate);
  }
  formData.set("metadata_json", JSON.stringify(payload.metadata || {}));

  if (payload.batchType === "daily") {
    const zbonFiles = payload.files.filter((entry) => entry.category === "zbon");
    if (zbonFiles.length !== 1) {
      throw new Error("Daily upload requires exactly one ZBON file.");
    }
    formData.append("zbon_file", zbonFiles[0].file, zbonFiles[0].name);
    for (const barFile of payload.files.filter((entry) => entry.category === "bar")) {
      formData.append("bar_files", barFile.file, barFile.name);
    }
    return formData;
  }

  const officeFiles = payload.files.filter((entry) => entry.category === "office");
  if (!officeFiles.length) {
    throw new Error("Office upload requires at least one office file.");
  }
  for (const officeFile of officeFiles) {
    formData.append("office_files", officeFile.file, officeFile.name);
  }
  return formData;
}

/**
 * Build a minimal pdf file placeholder for upload smoke.
 * @param {string} name
 */
function makePdf(name) {
  const content = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`;
  return new File([content], name, { type: "application/pdf" });
}

/**
 * Build smoke input from real file path if provided, otherwise fallback to placeholder.
 * @param {string} defaultName
 * @param {string} sourcePath
 */
async function buildPdfUploadInput(defaultName, sourcePath) {
  const trimmed = String(sourcePath || "").trim();
  if (!trimmed) {
    console.log(`[smoke] using placeholder PDF for ${defaultName}`);
    return { file: makePdf(defaultName), name: defaultName };
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const bytes = await fs.readFile(trimmed);
  const fileName = path.basename(trimmed) || defaultName;
  console.log(`[smoke] using real PDF ${trimmed}`);
  return {
    file: new File([bytes], fileName, { type: "application/pdf" }),
    name: fileName,
  };
}

/**
 * Normalize category text into contract enum.
 * @param {unknown} value
 * @param {unknown} fallback
 */
function normalizeCategory(value, fallback) {
  const source = String(value || fallback || "").toLowerCase();
  if (source === "bar" || source === "zbon" || source === "office") {
    return source;
  }
  return "";
}

/**
 * Normalize optional text values.
 * @param {unknown} value
 * @param {string} fallback
 */
function normalizeText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

/**
 * Parse json payload safely.
 * @param {string} text
 */
function safeParseJson(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Extract readable failure reason from batch payload.
 * @param {Record<string, unknown>} batch
 */
function readBatchFailureReason(batch) {
  if (!batch || typeof batch !== "object") {
    return "unknown reason";
  }
  const error = batch.error;
  if (error && typeof error === "object") {
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message.trim();
    }
    if (typeof error.code === "string" && error.code.trim()) {
      return error.code.trim();
    }
  }
  return "backend returned failed status without error message";
}

/**
 * Convert backend error payload to readable message.
 * @param {unknown} error
 */
function toErrorMessage(error) {
  if (!error || typeof error !== "object") {
    return "Unexpected error.";
  }

  const details = error.details;
  if (details && typeof details === "object" && "detail" in details) {
    const detail = details.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return "";
          }
          const loc = Array.isArray(entry.loc) ? entry.loc.join(".") : "";
          const msg = typeof entry.msg === "string" ? entry.msg : "";
          if (loc && msg) {
            return `${loc}: ${msg}`;
          }
          return msg;
        })
        .filter(Boolean);
      if (messages.length) {
        return messages.join("; ");
      }
    }
  }

  if (typeof error.message === "string" && error.message) {
    return error.message;
  }
  return "Unexpected error.";
}

/**
 * Sleep for a short time to avoid tight polling loops.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

await main();
