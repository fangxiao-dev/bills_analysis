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
  it("opens merged result directly from local output_path", async () => {
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);

    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          status: "merged",
          merge_output: { output_path: "outputs/webapp/x/result.xlsx" },
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Result" }));
    await screen.findByRole("button", { name: "Open Result" });
    expect(openMock).toHaveBeenCalled();

    openMock.mockRestore();
  });

  it("opens merged result when backend provides accessible output_url", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, status: 200 });
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);

    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          status: "merged",
          merge_output: { output_url: "https://example.com/result.xlsx" },
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Result" }));
    await screen.findByRole("button", { name: "Open Result" });
    expect(openMock).toHaveBeenCalledWith("https://example.com/result.xlsx", "_blank", "noopener,noreferrer");

    fetchMock.mockRestore();
    openMock.mockRestore();
  });

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

  it("shows localized tooltip on view action", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        reviewRows: [
          {
            row_id: "bar:invoice-2",
            category: "bar",
            filename: "invoice-2.pdf",
            result: { store_name: "Store", brutto: "10.00", netto: "8.40", run_date: "10/02/2026" },
            score: {},
          },
        ],
      },
    });

    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("title", "Open in new tab");
  });

  it("shows detailed localized preview-unavailable message", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        files: [],
        reviewRows: [
          {
            row_id: "bar:no-preview",
            category: "bar",
            filename: "x.pdf",
            result: { store_name: "Store", brutto: "10.00", netto: "8.40", run_date: "10/02/2026" },
            score: {},
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("link", { name: "View" }));
    expect(screen.getByText("Preview is unavailable for this row: missing preview URL/path and local file.")).toBeInTheDocument();
  });
});
