/**
 * Error wrapper for HTTP failures.
 */
export class AppHttpError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number; details?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = "AppHttpError";
    this.status = options.status;
    this.details = options.details;
  }
}

/**
 * Convert unknown failures to user-facing text.
 * @param {unknown} error
 */
export function toErrorMessage(error) {
  if (error instanceof AppHttpError) {
    if (error.status === 405) {
      return "Method not allowed (possible CORS preflight issue). Check backend CORS configuration.";
    }
    const detail = extractErrorDetail(error.details);
    if (detail) {
      return detail;
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error.";
}

/**
 * Send a JSON request with timeout support.
 * @param {{
 *  baseUrl: string;
 *  path: string;
 *  method?: string;
 *  body?: unknown;
 *  headers?: Record<string, string>;
 *  timeoutMs?: number;
 *  fetchImpl?: typeof fetch;
 * }} params
 */
export async function requestJson({
  baseUrl,
  path,
  method = "GET",
  body,
  headers = {},
  timeoutMs = 12000,
  fetchImpl = fetch,
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const requestHeaders = isFormData
    ? { ...headers }
    : {
        "Content-Type": "application/json",
        ...headers,
      };
  const requestBody = body === undefined ? undefined : isFormData ? body : JSON.stringify(body);

  try {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal: controller.signal,
    });

    const text = await response.text();
    const payload = text ? safeParseJson(text) : null;

    if (!response.ok) {
      throw new AppHttpError(`Request failed with status ${response.status}.`, {
        status: response.status,
        details: payload,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppHttpError("Request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse JSON in a safe way while preserving non-JSON payloads.
 * @param {string} value
 */
function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Extract and format FastAPI detail payload into a readable message.
 * @param {unknown} details
 */
function extractErrorDetail(details) {
  if (!details || typeof details !== "object" || !("detail" in details)) {
    return "";
  }
  return formatDetailValue(details.detail).trim();
}

/**
 * Format detail payload variants (string/object/list) into one line.
 * @param {unknown} detail
 */
function formatDetailValue(detail) {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => formatDetailEntry(item)).filter(Boolean).join("; ");
  }
  if (detail && typeof detail === "object") {
    return formatDetailEntry(detail);
  }
  return "";
}

/**
 * Format one FastAPI detail entry.
 * @param {unknown} entry
 */
function formatDetailEntry(entry) {
  if (typeof entry === "string") {
    return entry;
  }
  if (!entry || typeof entry !== "object") {
    return "";
  }

  const message = typeof entry.msg === "string" ? entry.msg.trim() : "";
  const type = typeof entry.type === "string" ? entry.type.trim() : "";
  const location = Array.isArray(entry.loc)
    ? entry.loc.map((value) => String(value).trim()).filter(Boolean).join(".")
    : "";

  if (location && message) {
    return `${location}: ${message}`;
  }
  if (message) {
    return message;
  }
  if (location && type) {
    return `${location}: ${type}`;
  }
  if (type) {
    return type;
  }
  return "";
}
