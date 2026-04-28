import { requestJson } from "../../../lib/http";

/**
 * Build a real statistics client wired to backend /v1 endpoints.
 * @param {{ baseUrl: string; fetchImpl?: typeof fetch }} params
 */
export function createRealStatisticsClient({ baseUrl, fetchImpl }) {
  return {
    mode: "real",

    /**
     * Preview monthly statistics from Daily/Bar and Office monthly Excel files.
     * @param {{ dailyExcel: File; officeExcel: File }} payload
     */
    async previewMonthlyStatistics(payload) {
      const body = new FormData();
      body.append("daily_excel", payload.dailyExcel, payload.dailyExcel.name);
      body.append("office_excel", payload.officeExcel, payload.officeExcel.name);
      return requestJson({
        baseUrl,
        path: "/v1/statistics/monthly-preview",
        method: "POST",
        body,
        fetchImpl,
      });
    },
  };
}
