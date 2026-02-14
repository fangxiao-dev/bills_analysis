import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReviewCategoryTable } from "./ReviewCategoryTable.jsx";

const columns = [
  { key: "filename", label: "File", readOnly: true },
  { key: "brutto", label: "Brutto" },
  { key: "netto", label: "Netto" },
];

describe("ReviewCategoryTable low-confidence highlight", () => {
  it("adds review-cell-low-confidence class when field score is below threshold", () => {
    const rows = [
      {
        id: "row-1",
        filename: "test.pdf",
        brutto: "10.00",
        netto: "8.40",
        score: { brutto: 0.3, netto: 0.9 },
      },
    ];

    render(
      <ReviewCategoryTable
        title="BAR"
        description="test"
        rows={rows}
        columns={columns}
        onChangeCell={vi.fn()}
      />
    );

    const bruttoInput = screen.getByLabelText("BAR-brutto-row-1");
    const nettoInput = screen.getByLabelText("BAR-netto-row-1");

    expect(bruttoInput.className).toContain("review-cell-low-confidence");
    expect(nettoInput.className).not.toContain("review-cell-low-confidence");
  });

  it("does not highlight when score is missing or empty", () => {
    const rows = [
      { id: "row-2", filename: "a.pdf", brutto: "5.00", netto: "4.20", score: {} },
    ];

    render(
      <ReviewCategoryTable
        title="BAR"
        description="test"
        rows={rows}
        columns={columns}
        onChangeCell={vi.fn()}
      />
    );

    const bruttoInput = screen.getByLabelText("BAR-brutto-row-2");
    expect(bruttoInput.className).not.toContain("review-cell-low-confidence");
  });

  it("falls back to total_tax score for brutto/netto when score is -1", () => {
    const rows = [
      {
        id: "row-3",
        filename: "b.pdf",
        brutto: "12.00",
        netto: "10.08",
        score: { brutto: -1, netto: -1, total_tax: 0.2 },
      },
    ];

    render(
      <ReviewCategoryTable
        title="BAR"
        description="test"
        rows={rows}
        columns={columns}
        onChangeCell={vi.fn()}
      />
    );

    const bruttoInput = screen.getByLabelText("BAR-brutto-row-3");
    const nettoInput = screen.getByLabelText("BAR-netto-row-3");

    // total_tax=0.2 < 0.5 → both should be highlighted
    expect(bruttoInput.className).toContain("review-cell-low-confidence");
    expect(nettoInput.className).toContain("review-cell-low-confidence");
  });
});
