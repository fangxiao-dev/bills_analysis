/**
 * Build a deterministic mock statistics client for local UI tests.
 */
export function createMockStatisticsClient() {
  return {
    mode: "mock",

    /**
     * Return a stable monthly statistics payload.
     */
    async previewMonthlyStatistics() {
      return {
        schema_version: "v1",
        summary: {
          revenue_brutto: 100411.24,
          daily_expense_brutto: 1183.74,
          office_expense_brutto: 111535.95,
          profit_brutto: -12308.45,
        },
        daily_series: [
          {
            date: "2025-11-01",
            revenue_brutto: 2437.3,
            daily_expense_brutto: 0,
            profit_before_office_brutto: 2437.3,
          },
          {
            date: "2025-11-02",
            revenue_brutto: 3024.4,
            daily_expense_brutto: 168.83,
            profit_before_office_brutto: 2855.57,
          },
        ],
        office_by_type: [
          { type: "Personal", brutto: 60000, count: 4, share: 0.538 },
          { type: "Miete", brutto: 28000, count: 2, share: 0.251 },
        ],
        office_rows: [
          { date: "2025-11-05", type: "Personal", name: "Gehalt Nov", brutto: 15000 },
          { date: "2025-11-10", type: "Miete", name: "Ramen KL", brutto: 14000 },
        ],
        warnings: [],
      };
    },
  };
}
