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

  it("highlights empty editable value even when score is missing", () => {
    const rows = [
      { id: "row-2", filename: "a.pdf", brutto: "-", netto: "4.20", score: {} },
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
    expect(bruttoInput.className).toContain("review-cell-low-confidence");
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

  it("does not add row-level highlight class when field is problematic", () => {
    const rows = [
      {
        id: "row-4",
        filename: "c.pdf",
        brutto: "20.00",
        netto: "16.80",
        score: { brutto: 0.4, netto: 0.95 },
      },
    ];

    const { container } = render(
      <ReviewCategoryTable
        title="BAR"
        description="test"
        rows={rows}
        columns={columns}
        onChangeCell={vi.fn()}
      />
    );

    const tr = container.querySelector("tbody tr");
    expect(tr?.className || "").toBe("");
  });

  it("highlights check field when value is False", () => {
    const boolColumns = [
      { key: "filename", label: "File", readOnly: true },
      { key: "receiver_ok", label: "Receiver OK" },
    ];
    const rows = [
      {
        id: "row-5",
        filename: "d.pdf",
        receiver_ok: "False",
        score: {},
      },
    ];

    render(
      <ReviewCategoryTable
        title="OFFICE"
        description="test"
        rows={rows}
        columns={boolColumns}
        onChangeCell={vi.fn()}
      />
    );

    const receiverInput = screen.getByLabelText("OFFICE-receiver_ok-row-5");
    expect(receiverInput.className).toContain("review-cell-low-confidence");
  });

  it("renders select input for configured column and keeps current backend value", () => {
    const selectColumns = [
      { key: "filename", label: "File", readOnly: true },
      { key: "type", label: "Type", inputType: "select", options: ["Miete", "Service&Andere"] },
    ];
    const rows = [
      {
        id: "row-6",
        filename: "e.pdf",
        type: "CustomType",
        score: {},
      },
    ];

    render(
      <ReviewCategoryTable
        title="OFFICE"
        description="test"
        rows={rows}
        columns={selectColumns}
        onChangeCell={vi.fn()}
      />
    );

    const typeSelect = screen.getByLabelText("OFFICE-type-row-6");
    expect(typeSelect.tagName).toBe("SELECT");
    expect(typeSelect).toHaveValue("CustomType");
    expect(screen.getByRole("option", { name: "CustomType" })).toBeInTheDocument();
  });
});
