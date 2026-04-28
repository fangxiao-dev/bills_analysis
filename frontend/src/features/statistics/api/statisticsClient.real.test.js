import { describe, expect, it, vi } from "vitest";
import { createMockStatisticsClient } from "./statisticsClient.mock";
import { createRealStatisticsClient } from "./statisticsClient.real";

describe("statistics clients", () => {
  it("real client posts Daily and Office files to monthly statistics endpoint", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          schema_version: "v1",
          summary: {
            revenue_brutto: 1000,
            daily_expense_brutto: 100,
            office_expense_brutto: 200,
            profit_brutto: 700,
          },
          daily_series: [],
          office_by_type: [],
          office_rows: [],
          warnings: [],
        }),
    });
    const dailyExcel = new File(["daily"], "daily.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const officeExcel = new File(["office"], "office.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const client = createRealStatisticsClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });

    const result = await client.previewMonthlyStatistics({ dailyExcel, officeExcel });

    expect(result.summary.profit_brutto).toBe(700);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/v1/statistics/monthly-preview",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
      }),
    );
    const body = fetchImpl.mock.calls[0][1].body;
    expect(body.get("daily_excel").name).toBe("daily.xlsx");
    expect(body.get("office_excel").name).toBe("office.xlsx");
  });

  it("mock client returns deterministic statistics", async () => {
    const client = createMockStatisticsClient();

    const result = await client.previewMonthlyStatistics({});

    expect(result.schema_version).toBe("v1");
    expect(result.summary.revenue_brutto).toBeGreaterThan(0);
    expect(result.office_by_type.length).toBeGreaterThan(0);
  });
});
