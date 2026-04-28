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
     * @param {{ dailyExcel: File; officeExcel: File; manualExpenseRows?: Array<{type: string; brutto: number; netto?: number | null}>; allowDuplicateManualTypes?: boolean }} payload
     */
    async previewMonthlyStatistics(payload) {
      const body = new FormData();
      body.append("daily_excel", payload.dailyExcel, payload.dailyExcel.name);
      body.append("office_excel", payload.officeExcel, payload.officeExcel.name);
      if (payload.manualExpenseRows?.length) {
        body.append("manual_expense_rows_json", JSON.stringify(payload.manualExpenseRows));
      }
      body.append("allow_duplicate_manual_types", payload.allowDuplicateManualTypes ? "true" : "false");
      return requestJson({
        baseUrl,
        path: "/v1/statistics/monthly-preview",
        method: "POST",
        body,
        fetchImpl,
      });
    },

    /**
     * Read configured manual Ausgabe type options.
     */
    async getManualExpenseTypes() {
      return requestJson({
        baseUrl,
        path: "/v1/statistics/manual-expense-types",
        method: "GET",
        fetchImpl,
      });
    },

    /**
     * Persist a new manual Ausgabe type option.
     * @param {string} type
     */
    async createManualExpenseType(type) {
      return requestJson({
        baseUrl,
        path: "/v1/statistics/manual-expense-types",
        method: "POST",
        body: { type },
        fetchImpl,
      });
    },
  };
}
