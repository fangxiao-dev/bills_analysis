import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DailyTrendChart } from "./DailyTrendChart";
import { ExpenseBreakdownPie } from "./ExpenseBreakdownPie";
import { ProfitBridgeChart } from "./ProfitBridgeChart";

describe("statistics chart refinements", () => {
  it("places profit bridge value labels above each bar", () => {
    render(
      <ProfitBridgeChart
        summary={{
          revenue_brutto: 50206,
          daily_expense_brutto: 1184,
          office_expense_brutto: 111536,
          profit_brutto: -62514,
        }}
      />,
    );

    screen.getAllByTestId("profit-bridge-bar").forEach((bar) => {
      const label = screen.getByTestId(`profit-bridge-value-${bar.dataset.label}`);
      expect(Number(label.getAttribute("y"))).toBeLessThan(Number(bar.getAttribute("y")));
    });
  });

  it("draws negative profit below the baseline with muted finance colors", () => {
    render(
      <ProfitBridgeChart
        summary={{
          revenue_brutto: 50206,
          daily_expense_brutto: 1184,
          office_expense_brutto: 111536,
          profit_brutto: -62514,
        }}
      />,
    );

    const baseline = Number(screen.getByTestId("profit-bridge-baseline").getAttribute("y1"));
    const profitBar = screen.getByTestId("profit-bridge-bar-profit");
    const revenueBar = screen.getByTestId("profit-bridge-bar-revenue");
    expect(Number(profitBar.getAttribute("y"))).toBe(baseline);
    expect(Number(profitBar.getAttribute("height"))).toBeGreaterThan(0);
    expect(revenueBar).toHaveClass("revenue");
    expect(profitBar).toHaveClass("profit");
  });

  it("centers the daily trend tooltip around the hovered point", () => {
    render(
      <DailyTrendChart
        series={[
          { date: "2025-11-01", revenue_brutto: 1000, daily_expense_brutto: 100 },
          { date: "2025-11-02", revenue_brutto: 1500, daily_expense_brutto: 120 },
          { date: "2025-11-03", revenue_brutto: 1750, daily_expense_brutto: 130 },
          { date: "2025-11-04", revenue_brutto: 900, daily_expense_brutto: 110 },
        ]}
      />,
    );

    const point = screen.getByTestId("daily-trend-point-revenue-2");
    fireEvent.mouseEnter(point);

    const tooltip = screen.getByTestId("daily-trend-tooltip");
    const rect = screen.getByTestId("daily-trend-tooltip-rect");
    const pointX = Number(point.getAttribute("cx"));
    const tooltipCenter = Number(rect.getAttribute("x")) + Number(rect.getAttribute("width")) / 2;
    expect(Math.abs(tooltipCenter - pointX)).toBeLessThanOrEqual(18);
    expect(tooltip).toHaveTextContent("2025-11-03");
  });

  it("renders a vertical axis for the daily trend chart", () => {
    render(
      <DailyTrendChart
        series={[
          { date: "2025-11-01", revenue_brutto: 1000, daily_expense_brutto: 100 },
          { date: "2025-11-02", revenue_brutto: 1500, daily_expense_brutto: 120 },
        ]}
      />,
    );

    expect(screen.getByTestId("daily-trend-y-axis")).toBeInTheDocument();
    expect(screen.getAllByTestId("daily-trend-y-label").length).toBeGreaterThanOrEqual(3);
  });

  it("allows duplicate daily dates without React key warnings", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <DailyTrendChart
        series={[
          { date: "2025-11-10", revenue_brutto: 1000, daily_expense_brutto: 100 },
          { date: "2025-11-10", revenue_brutto: 1500, daily_expense_brutto: 120 },
        ]}
      />,
    );

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining("Encountered two children with the same key"), expect.anything(), expect.anything());
    consoleErrorSpy.mockRestore();
  });

  it("keeps the selected pie slice exploded and supports reverse selection from category buttons", () => {
    const onSelectCategory = vi.fn();
    render(
      <ExpenseBreakdownPie
        selectedCategory="Miete"
        onSelectCategory={onSelectCategory}
        labels={{ allExpenses: "All expenses", spend: "Spend" }}
        breakdown={[
          { category: "Personal", source: "office", brutto: 300, share: 0.5 },
          { category: "Miete", source: "office", brutto: 200, share: 0.3333 },
          { category: "Bar Ausgabe", source: "daily_bar", brutto: 100, share: 0.1667 },
        ]}
      />,
    );

    const selectedSlice = screen.getByTestId("expense-slice-Miete");
    expect(selectedSlice).toHaveClass("selected");
    expect(selectedSlice.closest("g")?.getAttribute("transform")).toMatch(/translate\((?!0 0)/);

    fireEvent.click(screen.getByRole("button", { name: /Personal/ }));
    expect(onSelectCategory).toHaveBeenCalledWith("Personal");
  });

  it("shows the selected pie tooltip when no slice is hovered", () => {
    render(
      <ExpenseBreakdownPie
        selectedCategory="Miete"
        labels={{ allExpenses: "All expenses", spend: "Spend" }}
        breakdown={[
          { category: "Personal", source: "office", brutto: 300, share: 0.5 },
          { category: "Miete", source: "office", brutto: 200, share: 0.3333 },
        ]}
      />,
    );

    expect(screen.getByTestId("expense-pie-tooltip")).toHaveTextContent("Miete");
    expect(screen.getByTestId("expense-pie-tooltip")).toHaveTextContent("200,00");
  });

  it("temporarily shows the hovered pie tooltip over the selected category", () => {
    render(
      <ExpenseBreakdownPie
        selectedCategory="Miete"
        labels={{ allExpenses: "All expenses", spend: "Spend" }}
        breakdown={[
          { category: "Personal", source: "office", brutto: 300, share: 0.5 },
          { category: "Miete", source: "office", brutto: 200, share: 0.3333 },
        ]}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId("expense-slice-Personal"));
    expect(screen.getByTestId("expense-pie-tooltip")).toHaveTextContent("Personal");
    expect(screen.getByTestId("expense-pie-tooltip")).toHaveTextContent("300,00");

    fireEvent.mouseLeave(screen.getByTestId("expense-slice-Personal"));
    expect(screen.getByTestId("expense-pie-tooltip")).toHaveTextContent("Miete");
  });

  it("clears stale hover when selecting from category buttons", () => {
    const onSelectCategory = vi.fn();
    render(
      <ExpenseBreakdownPie
        selectedCategory="Miete"
        onSelectCategory={onSelectCategory}
        labels={{ allExpenses: "All expenses", spend: "Spend" }}
        breakdown={[
          { category: "Personal", source: "office", brutto: 300, share: 0.5 },
          { category: "Miete", source: "office", brutto: 200, share: 0.3333 },
          { category: "RamenIppin Europa", source: "office", brutto: 100, share: 0.1667 },
        ]}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId("expense-slice-Personal"));
    expect(screen.getByTestId("expense-pie-tooltip")).toHaveTextContent("Personal");

    fireEvent.click(screen.getByRole("button", { name: /RamenIppin Europa/ }));
    expect(screen.getByTestId("expense-pie-tooltip")).toHaveTextContent("Miete");
    expect(onSelectCategory).toHaveBeenCalledWith("RamenIppin Europa");
  });

  it("shows category and brutto in a pie tooltip when hovering a slice", () => {
    render(
      <ExpenseBreakdownPie
        labels={{ allExpenses: "All expenses", spend: "Spend" }}
        breakdown={[
          { category: "Personal", source: "office", brutto: 300, share: 0.5 },
          { category: "Miete", source: "office", brutto: 200, share: 0.3333 },
        ]}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId("expense-slice-Miete"));
    const tooltip = screen.getByTestId("expense-pie-tooltip");
    expect(tooltip).toHaveTextContent("Miete");
    expect(tooltip).toHaveTextContent("200,00");
  });

  it("renders a hovered pie tooltip above the chart without SVG hit targets", () => {
    render(
      <ExpenseBreakdownPie
        selectedCategory="RamenIppin Europa"
        labels={{ allExpenses: "All expenses", spend: "Spend" }}
        breakdown={[
          { category: "Personal", source: "office", brutto: 30000, share: 0.72 },
          { category: "RamenIppin Europa", source: "office", brutto: 8490.42, share: 0.2 },
          { category: "Miete", source: "office", brutto: 3000, share: 0.08 },
        ]}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId("expense-slice-RamenIppin Europa"));
    const tooltip = screen.getByTestId("expense-pie-tooltip");
    expect(tooltip).toHaveTextContent("RamenIppin Europa");
    expect(tooltip).toHaveTextContent("8.490,42");
    expect(tooltip.querySelector("rect")).not.toBeInTheDocument();
    expect(tooltip.querySelectorAll("span")).toHaveLength(2);
  });
});
