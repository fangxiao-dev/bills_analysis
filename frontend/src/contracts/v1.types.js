/**
 * Frozen schema version used by all v1 API contracts.
 * @type {"v1"}
 */
export const SCHEMA_VERSION = "v1";

/** @type {readonly ["daily", "office"]} */
export const BATCH_TYPES = ["daily", "office"];

/** @type {readonly ["queued", "running", "review_ready", "merging", "merged", "failed"]} */
export const BATCH_STATUSES = ["queued", "running", "review_ready", "merging", "merged", "failed"];

/** @type {readonly ["process_batch", "merge_batch"]} */
export const TASK_TYPES = ["process_batch", "merge_batch"];

/** @type {readonly ["bar", "zbon", "office"]} */
export const INPUT_FILE_CATEGORIES = ["bar", "zbon", "office"];

/**
 * @typedef {"daily" | "office"} BatchType
 */

/**
 * @typedef {"queued" | "running" | "review_ready" | "merging" | "merged" | "failed"} BatchStatus
 */

/**
 * @typedef {"process_batch" | "merge_batch"} TaskType
 */

/**
 * @typedef {"bar" | "zbon" | "office" | null} InputFileCategory
 */

/**
 * @typedef {Object} InputFile
 * @property {string} path
 * @property {InputFileCategory} [category]
 * @property {string | null} [status]
 * @property {unknown | null} [error]
 */

/**
 * @typedef {Object} ErrorInfo
 * @property {string} code
 * @property {string} message
 * @property {Record<string, unknown> | null} [details]
 */

/**
 * @typedef {Object} CreateBatchRequest
 * @property {BatchType} type
 * @property {BatchType} [batch_type]
 * @property {string | null} [run_date]
 * @property {InputFile[]} inputs
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {Object} SubmitReviewRequest
 * @property {Record<string, unknown>[]} rows
 */

/**
 * @typedef {Object} MergeRequest
 * @property {"overwrite" | "append"} [mode]
 * @property {string | null} [monthly_excel_path]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {Object} BatchResponse
 * @property {"v1"} schema_version
 * @property {string} batch_id
 * @property {BatchType} type
 * @property {BatchStatus} status
 * @property {string | null} [run_date]
 * @property {InputFile[]} [inputs]
 * @property {Record<string, unknown>} [artifacts]
 * @property {number} [review_rows_count]
 * @property {Record<string, unknown>} [merge_output]
 * @property {ErrorInfo | null} [error]
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} BatchListResponse
 * @property {"v1"} schema_version
 * @property {number} total
 * @property {BatchResponse[]} items
 */

/**
 * @typedef {Object} MergeTaskResponse
 * @property {"v1"} schema_version
 * @property {string} task_id
 * @property {string} batch_id
 * @property {TaskType} task_type
 * @property {string} created_at
 */

/**
 * @typedef {Object} CreateBatchUploadTaskResponse
 * @property {"v1"} schema_version
 * @property {string} task_id
 * @property {string} batch_id
 * @property {BatchType} type
 * @property {BatchStatus} status
 * @property {string} created_at
 */
