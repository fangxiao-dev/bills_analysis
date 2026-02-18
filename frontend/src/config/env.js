/**
 * Resolve API mode from Vite env with safe fallback.
 */
export const API_MODE = (import.meta.env.VITE_API_MODE || "mock").toLowerCase() === "real" ? "real" : "mock";

/**
 * Resolve API base URL from Vite env.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:8000");
