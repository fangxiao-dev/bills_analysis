import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ManualReviewPage } from "./ManualReviewPage";
import { useUploadFlowContext } from "../state/UploadFlowContext";

vi.mock("../state/UploadFlowContext", () => ({
  useUploadFlowContext: vi.fn(),
}));

// jsdom doesn't provide URL.createObjectURL / revokeObjectURL
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = vi.fn(() => "blob:stub");
}
if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = vi.fn();
}

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
      resolveMonthlyPathFromLocal: vi.fn(async () => "D:\\merge\\monthly.xlsx"),
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
  it("opens merged result from absolute output_path", async () => {
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);

    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          status: "merged",
          merge_output: { output_path: "D:\\outputs\\result.xlsx" },
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Result" }));
    expect(openMock).toHaveBeenCalled();
    openMock.mockRestore();
  });

  it("opens merged result from merged_excel_path", async () => {
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);

    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          status: "merged",
          merge_output: { merged_excel_path: "D:\\outputs\\full_result.xlsx" },
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Result" }));
    expect(openMock).toHaveBeenCalled();
    openMock.mockRestore();
  });

  it("opens relative output_path by resolving absolute prefix from batch inputs", async () => {
    const openMock = vi.spyOn(window, "open").mockImplementation(() => null);

    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          status: "merged",
          inputs: [{ path: "D:\\CodeSpace\\prj_rechnung\\bills__frontend\\outputs\\webapp\\uploads\\x\\bar\\01.pdf" }],
          merge_output: { output_path: "outputs/webapp/x/result.xlsx" },
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Result" }));
    expect(openMock).toHaveBeenCalled();
    openMock.mockRestore();
  });

  it("shows unavailable message when merge result path is relative without absolute hints", async () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          status: "merged",
          inputs: [{ path: "outputs/webapp/uploads/x/zbon/01.pdf" }],
          merge_output: { output_path: "outputs/webapp/x/result.xlsx" },
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Result" }));
    await screen.findByText(/Merged result link is unavailable/i);
  });

  it("opens merged result when backend provides output_url", async () => {
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
    expect(openMock).toHaveBeenCalledWith("https://example.com/result.xlsx", "_blank", "noopener,noreferrer");
    openMock.mockRestore();
  });

  it("keeps submit enabled in local source mode without selecting excel", () => {
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

  it("sets pending merge path to resolved absolute path after selecting local excel", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "from Local" }));

    const fileInput = screen.getByLabelText("Choose Local Excel");
    const file = new File(["excel"], "monthly.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByDisplayValue("D:\\merge\\monthly.xlsx")).toBeInTheDocument();
  });

  it("submits with empty monthly path when local source has no selected excel", async () => {
    const actions = {
      submitReviewOnly: vi.fn(async () => true),
      queueMergeOnly: vi.fn(async () => true),
      fetchReviewRows: vi.fn(async () => []),
      resolveMonthlyPathFromLocal: vi.fn(async () => "D:\\merge\\monthly.xlsx"),
      retryMerge: vi.fn(async () => true),
    };

    renderPage({ actions });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(actions.queueMergeOnly).toHaveBeenCalledWith({
        mode: "overwrite",
        monthly_excel_path: "",
        metadata: {},
      });
    });
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

  it("renders office type selector and sends type/receiver_ok in review payload", async () => {
    const actions = {
      submitReviewOnly: vi.fn(async () => true),
      queueMergeOnly: vi.fn(async () => true),
      fetchReviewRows: vi.fn(async () => []),
      resolveMonthlyPathFromLocal: vi.fn(async () => "D:\\merge\\monthly.xlsx"),
      retryMerge: vi.fn(async () => true),
    };

    renderPage({
      actions,
      state: {
        ...buildBaseContext().state,
        reviewRows: [
          {
            row_id: "office:invoice-1",
            category: "office",
            filename: "office-1.pdf",
            result: {
              type: "Service&Andere",
              sender: "Vendor A",
              brutto: "100.00",
              netto: "90.00",
              tax_id: "DE123",
              receiver_ok: true,
              run_date: "10/02/2026",
            },
            score: {},
          },
        ],
      },
    });

    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Receiver OK")).toBeInTheDocument();
    const typeSelect = screen.getByLabelText("OFFICE Review Items-type-office:invoice-1");
    expect(typeSelect).toBeInTheDocument();
    fireEvent.change(typeSelect, { target: { value: "Miete" } });
    expect(screen.getByDisplayValue("True")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(actions.submitReviewOnly).toHaveBeenCalled();
    });

    const submittedRows = actions.submitReviewOnly.mock.calls[0][0];
    expect(submittedRows[0].result.type).toBe("Miete");
    expect(submittedRows[0].result.receiver_ok).toBe(true);
    expect(submittedRows[0].result.receiver).toBeUndefined();
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
