import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StatisticsPage } from "./StatisticsPage";
import { previewMonthlyStatistics } from "../api/statisticsClient";

vi.mock("../api/statisticsClient", () => ({
  previewMonthlyStatistics: vi.fn(),
}));

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
    daily_series: [{ date: "2025-11-01", revenue_brutto: 1000, daily_expense_brutto: 100 }],
    office_by_type: [{ type: "Miete", brutto: 200, count: 1, share: 1 }],
    office_rows: [{ date: "2025-11-02", type: "Miete", name: "Rent invoice", brutto: 200 }],
    expense_breakdown: [
      { category: "Miete", source: "office", brutto: 200, count: 1, share: 0.6667 },
      { category: "Bar Ausgabe", source: "daily_bar", brutto: 100, count: 1, share: 0.3333 },
    ],
    daily_expense_rows: [{ date: "2025-11-01", brutto: 100 }],
    warnings: [],
    ...overrides,
  };
}

describe("StatisticsPage", () => {
  beforeEach(() => {
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

    await waitFor(() => screen.getByText("Bar Ausgabe"));
    fireEvent.click(screen.getByText("Bar Ausgabe"));
    expect(screen.getByText("2025-11-01")).toBeInTheDocument();
    expect(screen.getByTestId("expense-drilldown")).toHaveTextContent("100,00");
  });

  it("shows office detail rows after selecting an expense type", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => screen.getByText("Miete"));
    fireEvent.click(screen.getByText("Miete"));
    expect(screen.getByText("Rent invoice")).toBeInTheDocument();
  });

  it("places daily trend after the first-row chart pair", async () => {
    mockPreviewMonthlyStatistics.mockResolvedValue(statisticsPayload());
    renderPage();

    fireEvent.change(screen.getByTestId("file-input-daily"), { target: { files: [excelFile("daily.xlsx")] } });
    fireEvent.change(screen.getByTestId("file-input-office"), { target: { files: [excelFile("office.xlsx")] } });
    fireEvent.click(screen.getByTestId("generate-button"));

    await waitFor(() => expect(screen.getByTestId("statistics-first-row")).toBeInTheDocument());
    const firstRow = screen.getByTestId("statistics-first-row");
    expect(firstRow).toHaveTextContent("Revenue vs Expenses");
    expect(firstRow).toHaveTextContent("Expense Breakdown");
    expect(firstRow).not.toHaveTextContent("Daily Trend");
    expect(screen.getByTestId("statistics-daily-trend-row")).toHaveTextContent("Daily Trend");
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
