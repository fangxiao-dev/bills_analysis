import { describe, expect, it, vi } from "vitest";
import { createMockStatisticsClient } from "./statisticsClient.mock";
import { createRealStatisticsClient } from "./statisticsClient.real";

describe("statistics clients", () => {
  it("real client posts Daily, Office, and manual expenses to monthly statistics endpoint", async () => {
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

    const result = await client.previewMonthlyStatistics({
      dailyExcel,
      officeExcel,
      manualExpenseRows: [{ type: "Personalkosten", brutto: 1200.5, netto: 1008.82 }],
      allowDuplicateManualTypes: true,
    });

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
    expect(body.get("manual_expense_rows_json")).toBe('[{"type":"Personalkosten","brutto":1200.5,"netto":1008.82}]');
    expect(body.get("allow_duplicate_manual_types")).toBe("true");
  });

  it("real client reads and creates manual expense types", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ schema_version: "v1", types: ["Personalkosten"] }) })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ schema_version: "v1", types: ["Personalkosten", "代付款"] }),
      });
    const client = createRealStatisticsClient({ baseUrl: "http://127.0.0.1:8000", fetchImpl });

    const first = await client.getManualExpenseTypes();
    const second = await client.createManualExpenseType("代付款");

    expect(first.types).toEqual(["Personalkosten"]);
    expect(second.types).toEqual(["Personalkosten", "代付款"]);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8000/v1/statistics/manual-expense-types",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:8000/v1/statistics/manual-expense-types",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "代付款" }),
      }),
    );
  });

  it("mock client returns deterministic statistics", async () => {
    const client = createMockStatisticsClient();

    const result = await client.previewMonthlyStatistics({});

    expect(result.schema_version).toBe("v1");
    expect(result.summary.revenue_brutto).toBeGreaterThan(0);
    expect(result.office_by_type.length).toBeGreaterThan(0);
  });
});
