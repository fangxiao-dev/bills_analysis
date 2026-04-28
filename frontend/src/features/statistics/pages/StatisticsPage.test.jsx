import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatisticsPage } from "./StatisticsPage";
import { createManualExpenseType, getManualExpenseTypes, previewMonthlyStatistics } from "../api/statisticsClient";

vi.mock("../api/statisticsClient", () => ({
  createManualExpenseType: vi.fn(),
  getManualExpenseTypes: vi.fn(),
  previewMonthlyStatistics: vi.fn(),
}));

const mockCreateManualExpenseType = createManualExpenseType;
const mockGetManualExpenseTypes = getManualExpenseTypes;
const mockPreviewMonthlyStatistics = previewMonthlyStatistics;

function renderPage() {
  return render(
    <MemoryRouter>
      <StatisticsPage />
    </MemoryRouter>,
  );
}

function excelFile(name) {
  return new File(["xlsx"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function statisticsPayload(overrides = {}) {
  return {
    schema_version: "v1",
    summary: {
      revenue_brutto: 1000,
      daily_expense_brutto: 100,
      office_expense_brutto: 200,
      profit_brutto: 700,
    },
    daily_series: [
      { date: "2025-11-01", revenue_brutto: 1000, daily_expense_brutto: 100 },
      { date: "2025-11-02", revenue_brutto: 700, daily_expense_brutto: 40 },
    ],
    office_by_type: [{ type: "Miete", brutto: 200, count: 1, share: 1 }],
    office_rows: [
      { date: "2025-11-02", type: "Miete", name: "Rent invoice", brutto: 200, netto: 168.07 },
      { date: "2025-11-03", type: "Personal", name: "Payroll", brutto: 300, netto: 252.1 },
    ],
    expense_breakdown: [
      { category: "Personal", source: "office", brutto: 300, count: 1, share: 0.5 },
      { category: "Miete", source: "office", brutto: 200, count: 1, share: 0.3333 },
      { category: "Bar Ausgabe", source: "daily_bar", brutto: 100, count: 1, share: 0.1667 },
    ],
    daily_expense_rows: [{ date: "2025-11-01", brutto: 100, netto: 84.03 }],
    warnings: [],
    ...overrides,
  };
}

describe("StatisticsPage", () => {
  beforeEach(() => {
    mockCreateManualExpenseType.mockReset();
    mockCreateManualExpenseType.mockResolvedValue({ types: ["Personalkosten", "代付款", "Versicherung"] });
    mockGetManualExpenseTypes.mockReset();
    mockGetManualExpenseTypes.mockResolvedValue({ types: ["Personalkosten", "代付款"] });
    mockPreviewMonthlyStatistics.mockReset();
  });

  it("disables generate until both Excel files are selected", () => {
    renderPage();

    const button = screen.getByTestId("generate-button");
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    expect(button).toBeEnabled();
  });

  it("renders KPI values after successful preview", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => expect(screen.getByTestId("kpi-revenue")).toHaveTextContent("1.000,00"));
    expect(screen.getByTestId("kpi-profit")).toHaveTextContent("700,00");
  });

  it("shows expense drilldown rows after selecting Bar Ausgabe", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => screen.getByTestId("expense-drilldown"));
    fireEvent.click(screen.getByRole("button", { name: /Bar Ausgabe/ }));
    expect(screen.getByText("2025-11-01")).toBeInTheDocument();
    expect(screen.getByTestId("expense-drilldown")).toHaveTextContent("100,00");
    expect(screen.getByTestId("expense-drilldown")).not.toHaveTextContent("Rent invoice");
  });

  it("adds and deletes manual expense rows and submits brutto and netto", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    expect(await screen.findByTestId("manual-expense-type-select")).toHaveValue("Personalkosten");
    fireEvent.change(screen.getByTestId("manual-expense-brutto-input"), { target: { value: "1200,50" } });
    await waitFor(() => expect(screen.getByTestId("manual-expense-netto-input")).toHaveValue("1200,50"));
    fireEvent.change(screen.getByTestId("manual-expense-netto-input"), { target: { value: "1008.82" } });
    fireEvent.click(screen.getByTestId("manual-expense-add-button"));

    expect(screen.getByTestId("manual-expense-row-0")).toHaveTextContent("Personalkosten");
    expect(screen.getByTestId("manual-expense-row-0")).toHaveTextContent("1200,50");
    fireEvent.change(screen.getByTestId("manual-expense-brutto-input"), { target: { value: "300.00" } });
    fireEvent.click(screen.getByTestId("manual-expense-add-button"));
    expect(screen.getByTestId("manual-expense-row-1")).toHaveTextContent("代付款");
    fireEvent.click(screen.getByTestId("manual-expense-delete-1"));
    expect(screen.queryByTestId("manual-expense-row-1")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => expect(mockPreviewMonthlyStatistics).toHaveBeenCalled());
    expect(mockPreviewMonthlyStatistics).toHaveBeenCalledWith({
      dailyExcel: expect.any(File),
      officeExcel: expect.any(File),
      manualExpenseRows: [{ type: "Personalkosten", brutto: 1200.5, netto: 1008.82 }],
      allowDuplicateManualTypes: false,
    });
  });

  it("creates a manual expense type from the select create option", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Versicherung");
    renderPage();

    const select = await screen.findByTestId("manual-expense-type-select");
    fireEvent.change(select, { target: { value: "__create_new_type__" } });

    await waitFor(() => expect(mockCreateManualExpenseType).toHaveBeenCalledWith("Versicherung"));
    expect(screen.getByRole("option", { name: "Versicherung" })).toBeInTheDocument();
    expect(select).toHaveValue("Versicherung");
    promptSpy.mockRestore();
  });

  it("asks before merging duplicate manual types with office Excel categories", async () => {
    const duplicateError = Object.assign(new Error("Duplicate manual expense types"), {
      status: 409,
      details: {
        detail: {
          code: "DUPLICATE_MANUAL_EXPENSE_TYPES",
          duplicate_types: ["Personalkosten"],
        },
      },
    });
    mockPreviewMonthlyStatistics.mockRejectedValueOnce(duplicateError).mockResolvedValueOnce(statisticsPayload());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();

    await screen.findByTestId("manual-expense-type-select");
    fireEvent.change(screen.getByTestId("manual-expense-brutto-input"), { target: { value: "1200" } });
    fireEvent.click(screen.getByTestId("manual-expense-add-button"));
    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => expect(mockPreviewMonthlyStatistics).toHaveBeenCalledTimes(2));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Personalkosten"));
    expect(mockPreviewMonthlyStatistics.mock.calls[1][0].allowDuplicateManualTypes).toBe(true);
    confirmSpy.mockRestore();
  });

  it("shows office detail rows after selecting an expense type", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => screen.getByTestId("expense-drilldown"));
    fireEvent.click(screen.getByRole("button", { name: /Miete/ }));
    expect(screen.getByText("Rent invoice")).toBeInTheDocument();
    expect(screen.getByTestId("expense-drilldown")).not.toHaveTextContent("Payroll");
  });

  it("places daily trend in the first-row chart pair", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => expect(screen.getByTestId("statistics-first-row")).toBeInTheDocument());
    const firstRow = screen.getByTestId("statistics-first-row");
    expect(firstRow).toHaveTextContent("Revenue vs Expenses");
    expect(firstRow).toHaveTextContent("Daily Trend");
    expect(firstRow).not.toHaveTextContent("Expense Breakdown");
    expect(screen.getByTestId("statistics-daily-trend-row")).toHaveTextContent("Daily Trend");
  });

  it("renders expense detail as a separate section below daily trend", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => expect(screen.getByTestId("statistics-first-row")).toBeInTheDocument());
    expect(screen.getByTestId("statistics-first-row")).not.toContainElement(screen.getByTestId("expense-drilldown"));
    expect(screen.getByTestId("statistics-expense-detail-row")).toContainElement(screen.getByTestId("expense-drilldown"));
  });

  it("shows all expense detail rows by default with count and total", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(
      statisticsPayload({
        office_rows: [
          { date: "2025-11-02", type: "Miete", name: "Rent invoice", brutto: "200.00", netto: "168.07" },
          { date: "2025-11-03", type: "Personal", name: "Payroll", brutto: 300, netto: "252,10 €" },
        ],
      }),
    );
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    const drilldown = await screen.findByTestId("expense-drilldown");
    expect(within(drilldown).getByText("All expenses")).toBeInTheDocument();
    expect(within(drilldown).getByText("3 rows")).toBeInTheDocument();
    expect(within(drilldown).getByText(/600,00/)).toBeInTheDocument();
    expect(within(drilldown).getByText("Rent invoice")).toBeInTheDocument();
    expect(within(drilldown).getByText(/168,07/)).toBeInTheDocument();
    expect(within(drilldown).getByText("Payroll")).toBeInTheDocument();
    expect(within(drilldown).getAllByText("Bar Ausgabe").length).toBeGreaterThan(0);
    expect(within(drilldown).getByText(/84,03/)).toBeInTheDocument();
  });

  it("filters expense detail rows from the breakdown category controls", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => screen.getByTestId("expense-drilldown"));
    fireEvent.click(screen.getByRole("button", { name: /Miete/ }));

    const drilldown = screen.getByTestId("expense-drilldown");
    expect(within(drilldown).getAllByText("Miete").length).toBeGreaterThan(0);
    expect(within(drilldown).getByText("1 row")).toBeInTheDocument();
    expect(within(drilldown).getAllByText(/200,00/).length).toBeGreaterThan(0);
    expect(within(drilldown).getByText("Rent invoice")).toBeInTheDocument();
    expect(within(drilldown).queryByText("Payroll")).not.toBeInTheDocument();
  });

  it("shows daily trend values on point hover", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    const point = await screen.findByTestId("daily-trend-point-revenue-0");
    fireEvent.mouseEnter(point);
    expect(screen.getByTestId("daily-trend-tooltip")).toHaveTextContent("2025-11-01");
    expect(screen.getByTestId("daily-trend-tooltip")).toHaveTextContent("1.000,00");
  });

  it("displays warnings returned by the backend", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(
      statisticsPayload({
        warnings: ["One cell had a bad value"],
      }),
    );
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => expect(screen.getByText("One cell had a bad value")).toBeInTheDocument());
  });
});
