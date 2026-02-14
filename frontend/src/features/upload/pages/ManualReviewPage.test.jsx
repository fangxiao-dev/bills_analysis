import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ManualReviewPage } from "./ManualReviewPage";
import { useUploadFlowContext } from "../state/UploadFlowContext";

vi.mock("../state/UploadFlowContext", () => ({
  useUploadFlowContext: vi.fn(),
}));

const mockContext = useUploadFlowContext;

/**
 * Render manual review page with mocked flow context.
 * @param {Partial<ReturnType<typeof buildBaseContext>>} overrides
 */
function renderPage(overrides = {}) {
  mockContext.mockReturnValue({
    ...buildBaseContext(),
    ...overrides,
  });

  return render(
    <MemoryRouter>
      <ManualReviewPage />
    </MemoryRouter>,
  );
}

/**
 * Build default context shape expected by ManualReviewPage.
 */
function buildBaseContext() {
  return {
    client: { mode: "mock" },
    flags: { isBusy: false, isDone: false },
    actions: {
      submitReviewOnly: vi.fn(async () => true),
      queueMergeOnly: vi.fn(async () => true),
      fetchReviewRows: vi.fn(async () => []),
      resolveMonthlyPathFromLocal: vi.fn(async (file) => `local://${file.name}`),
      retryMerge: vi.fn(async () => true),
    },
    state: {
      files: [{ id: "f1", name: "a.pdf", category: "bar" }],
      runDate: "10/02/2026",
      reviewRows: [],
      reviewRowsLoading: false,
      batch: {
        batch_id: "b1",
        status: "review_ready",
        review_rows_count: 0,
        merge_output: {},
      },
      reviewSubmitted: false,
      mergeRequestPayload: { mode: "overwrite", monthly_excel_path: null },
      mergeTask: null,
      lastMergeTaskId: null,
      systemError: "",
    },
  };
}

describe("ManualReviewPage", () => {
  it("shows single submit button and no merge-status panel", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    expect(screen.queryByText("Merge Status")).not.toBeInTheDocument();
  });

  it("shows retry merge button when batch failed and review exists", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          status: "failed",
          review_rows_count: 2,
        },
      },
    });
    expect(screen.getByRole("button", { name: "Retry Merge" })).toBeInTheDocument();
  });

  it("forces overwrite only for daily mode", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          type: "daily",
        },
      },
    });

    const modeSelect = screen.getByRole("combobox", { name: /mode/i });
    expect(modeSelect).toBeDisabled();
    expect(screen.queryByRole("option", { name: "append" })).not.toBeInTheDocument();
  });

  it("allows append/overwrite for office mode", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          type: "office",
        },
      },
    });

    const modeSelect = screen.getByRole("combobox", { name: /mode/i });
    expect(modeSelect).toBeEnabled();
    expect(screen.getByRole("option", { name: "append" })).toBeInTheDocument();
  });

  it("renders monthly path source switch options", () => {
    renderPage();
    expect(screen.getByRole("button", { name: "from Local" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "from Lark" })).toBeInTheDocument();
  });

  it("sets monthly path to local://filename after selecting local excel", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "from Local" }));

    const fileInput = screen.getByLabelText("Choose Local Excel");
    const file = new File(["excel"], "monthly.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByDisplayValue("local://monthly.xlsx")).toBeInTheDocument();
  });

  it("renders backend validation message from systemError", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        systemError: "body.rows.0.result.brutto: Field required",
      },
    });

    expect(screen.getByText("body.rows.0.result.brutto: Field required")).toBeInTheDocument();
  });

  it("highlights low-confidence review cells from backend review rows", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        reviewRows: [
          {
            row_id: "bar:invoice-1",
            category: "bar",
            filename: "invoice-1.pdf",
            result: {
              store_name: "Store A",
              brutto: "10.00",
              netto: "8.40",
              run_date: "10/02/2026",
            },
            score: {
              brutto: 0.2,
              netto: 0.9,
            },
          },
        ],
      },
    });

    const bruttoInput = screen.getByLabelText("BAR Review Items-brutto-bar:invoice-1");
    const nettoInput = screen.getByLabelText("BAR Review Items-netto-bar:invoice-1");

    expect(bruttoInput.className).toContain("review-cell-low-confidence");
    expect(nettoInput.className).not.toContain("review-cell-low-confidence");
  });
});
