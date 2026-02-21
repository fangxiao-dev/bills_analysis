import { z } from "zod";

const schemaVersionSchema = z.literal("v1");
const batchTypeSchema = z.enum(["daily", "office"]);
const batchStatusSchema = z.enum(["queued", "running", "review_ready", "merging", "merged", "failed"]);
const taskTypeSchema = z.enum(["process_batch", "merge_batch"]);
const categorySchema = z.enum(["bar", "zbon", "office"]);
const runDatePattern = /^\d{2}\/\d{2}\/\d{4}$/;

const passthroughRecordSchema = z.record(z.string(), z.unknown());

const inputFileRequestSchema = z
  .object({
    path: z.string().min(1),
    category: categorySchema.nullable().optional(),
  })
  .strict();

const inputFileResponseSchema = z
  .object({
    path: z.string().min(1),
    category: categorySchema.nullable().optional(),
    status: z.string().nullable().optional(),
    error: z.unknown().nullable().optional(),
  })
  .passthrough();

const errorInfoSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: passthroughRecordSchema.nullable().optional(),
  })
  .strict();

const createBatchSchema = z
  .object({
    type: batchTypeSchema.optional(),
    batch_type: batchTypeSchema.optional(),
    run_date: z.string().regex(runDatePattern).nullable().optional(),
    inputs: z.array(inputFileRequestSchema).min(1),
    metadata: passthroughRecordSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.type && !value.batch_type) {
      ctx.addIssue({ code: "custom", message: "`type` is required." });
      return;
    }
    if (value.type && value.batch_type && value.type !== value.batch_type) {
      ctx.addIssue({ code: "custom", message: "`type` and `batch_type` must match when both are provided." });
    }
  })
  .transform((value) => ({
    type: value.type ?? value.batch_type,
    run_date: value.run_date ?? null,
    inputs: value.inputs,
    metadata: value.metadata ?? {},
  }));

const submitReviewSchema = z
  .object({
    rows: z.array(passthroughRecordSchema).min(1),
  })
  .strict();

const mergeRequestSchema = z
  .object({
    mode: z.enum(["overwrite", "append"]).default("overwrite"),
    monthly_excel_path: z.string().nullable().optional(),
    metadata: passthroughRecordSchema.optional(),
  })
  .strict()
  .transform((value) => ({
    mode: value.mode,
    monthly_excel_path: value.monthly_excel_path ?? null,
    metadata: value.metadata ?? {},
  }));

const batchResponseSchema = z
  .object({
    schema_version: schemaVersionSchema.default("v1"),
    batch_id: z.string(),
    type: batchTypeSchema,
    status: batchStatusSchema,
    run_date: z.string().nullable().optional(),
    inputs: z.array(inputFileResponseSchema).optional(),
    artifacts: passthroughRecordSchema.optional(),
    review_rows_count: z.number().optional(),
    merge_output: passthroughRecordSchema.optional(),
    error: errorInfoSchema.nullable().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict()
  .transform((value) => ({
    ...value,
    run_date: value.run_date ?? null,
    inputs: value.inputs ?? [],
    artifacts: value.artifacts ?? {},
    review_rows_count: value.review_rows_count ?? 0,
    merge_output: value.merge_output ?? {},
    error: value.error ?? null,
  }));

const batchListResponseSchema = z
  .object({
    schema_version: schemaVersionSchema.default("v1"),
    total: z.number(),
    items: z.array(batchResponseSchema),
  })
  .strict();

const mergeTaskResponseSchema = z
  .object({
    schema_version: schemaVersionSchema.default("v1"),
    task_id: z.string(),
    batch_id: z.string(),
    task_type: taskTypeSchema,
    created_at: z.string().datetime(),
  })
  .strict();

const createBatchUploadTaskResponseSchema = z
  .object({
    schema_version: schemaVersionSchema.default("v1"),
    task_id: z.string(),
    batch_id: z.string(),
    type: batchTypeSchema,
    status: batchStatusSchema,
    created_at: z.string().datetime(),
  })
  .strict();

const reportTypeCorrectionSchema = z
  .object({
    row_id: z.string(),
    filename: z.string(),
    original_type: z.string(),
    corrected_type: z.string(),
  })
  .strict();

const reportErrorResponseSchema = z
  .object({
    schema_version: schemaVersionSchema.default("v1"),
    status: z.enum(["reported", "skipped"]),
    corrections: z.array(reportTypeCorrectionSchema),
  })
  .strict();

/**
 * Validate and normalize CreateBatchRequest payload.
 * @param {unknown} payload
 */
export function parseCreateBatchRequest(payload) {
  return createBatchSchema.parse(payload);
}

/**
 * Validate SubmitReviewRequest payload.
 * @param {unknown} payload
 */
export function parseSubmitReviewRequest(payload) {
  return submitReviewSchema.parse(payload);
}

/**
 * Validate and normalize MergeRequest payload.
 * @param {unknown} payload
 */
export function parseMergeRequest(payload) {
  return mergeRequestSchema.parse(payload ?? {});
}

/**
 * Validate BatchResponse payload.
 * @param {unknown} payload
 */
export function parseBatchResponse(payload) {
  return batchResponseSchema.parse(payload);
}

/**
 * Validate BatchListResponse payload.
 * @param {unknown} payload
 */
export function parseBatchListResponse(payload) {
  return batchListResponseSchema.parse(payload);
}

/**
 * Validate MergeTaskResponse payload.
 * @param {unknown} payload
 */
export function parseMergeTaskResponse(payload) {
  return mergeTaskResponseSchema.parse(payload);
}

/**
 * Validate CreateBatchUploadTaskResponse payload.
 * @param {unknown} payload
 */
export function parseCreateBatchUploadTaskResponse(payload) {
  return createBatchUploadTaskResponseSchema.parse(payload);
}

/**
 * Validate report-error API response payload.
 * @param {unknown} payload
 */
export function parseReportErrorResponse(payload) {
  return reportErrorResponseSchema.parse(payload);
}

/**
 * Runtime helper for date format validation.
 * @param {string} value
 */
export function isRunDateValid(value) {
  return runDatePattern.test(value);
}

export {
  batchTypeSchema,
  batchStatusSchema,
  taskTypeSchema,
  inputFileRequestSchema,
  inputFileResponseSchema,
  createBatchSchema,
  submitReviewSchema,
  mergeRequestSchema,
  batchResponseSchema,
  batchListResponseSchema,
  mergeTaskResponseSchema,
  createBatchUploadTaskResponseSchema,
  reportTypeCorrectionSchema,
  reportErrorResponseSchema,
};
