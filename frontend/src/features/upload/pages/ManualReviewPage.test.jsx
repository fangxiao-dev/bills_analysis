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
  const base = buildBaseContext();
  mockContext.mockReturnValue({
    ...base,
    ...overrides,
    client: {
      ...base.client,
      ...(overrides.client || {}),
    },
    flags: {
      ...base.flags,
      ...(overrides.flags || {}),
    },
    actions: {
      ...base.actions,
      ...(overrides.actions || {}),
    },
    state: {
      ...base.state,
      ...(overrides.state || {}),
    },
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
      removeFile: vi.fn(),
      retryMerge: vi.fn(async () => true),
      reportTypeError: vi.fn(async () => ({ status: "skipped", corrections: [] })),
    },
    state: {
      files: [{ id: "f1", name: "a.pdf", category: "bar", tax_id: "DE123" }],
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
      reportTypeErrorConsumed: false,
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

  it("renders report type error button for office batch but keeps it disabled before current submit", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          type: "office",
          review_rows_count: 1,
        },
        reviewSubmitted: true,
      },
    });
    const reportButton = screen.getByRole("button", { name: "Report Type Error" });
    expect(reportButton).toBeInTheDocument();
    expect(reportButton).toBeDisabled();
  });

  it("keeps report type error button invalid before review submit", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          type: "office",
          review_rows_count: 1,
        },
        reviewSubmitted: false,
      },
    });
    expect(screen.getByRole("button", { name: "Report Type Error" })).toBeDisabled();
  });

  it("keeps submit enabled for merged batch to allow re-submit", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          status: "merged",
        },
      },
    });
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("reports type correction and renders feedback banner", async () => {
    const actions = {
      submitReviewOnly: vi.fn(async () => true),
      queueMergeOnly: vi.fn(async () => true),
      fetchReviewRows: vi.fn(async () => []),
      resolveMonthlyPathFromLocal: vi.fn(async () => "D:\\merge\\monthly.xlsx"),
      retryMerge: vi.fn(async () => true),
      reportTypeError: vi.fn(async () => ({
        status: "reported",
        corrections: [
          {
            row_id: "row-0001",
            filename: "office.pdf",
            original_type: "Service&Andere",
            corrected_type: "Miete",
          },
        ],
      })),
    };

    renderPage({
      actions,
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          type: "office",
          review_rows_count: 1,
        },
        reviewSubmitted: true,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(actions.submitReviewOnly).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Report Type Error" }));
    await waitFor(() => {
      expect(actions.reportTypeError).toHaveBeenCalledWith("b1");
    });
    expect(screen.getByText("Reported 1 type correction(s).")).toBeInTheDocument();
  });

  it("keeps report type error invalid after one successful report", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        batch: {
          ...buildBaseContext().state.batch,
          type: "office",
          review_rows_count: 1,
        },
        reportTypeErrorConsumed: true,
      },
    });
    expect(screen.getByRole("button", { name: "Report Type Error" })).toBeDisabled();
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
      reportTypeError: vi.fn(async () => ({ status: "skipped", corrections: [] })),
    };

    renderPage({
      actions,
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
              tax_id: "DE123",
            },
            score: {},
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(actions.queueMergeOnly).toHaveBeenCalledWith({
        mode: "overwrite",
        monthly_excel_path: "",
        metadata: {},
      });
    });
  });

  it("shows repeat submit hint after submit succeeds", async () => {
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
              tax_id: "DE123",
            },
            score: {},
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText(/You can submit again to regenerate reviewed\.json/i)).toBeInTheDocument();
  });

  it("shows one combined done hint instead of two separate hints", async () => {
    renderPage({
      flags: { isBusy: false, isDone: true },
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
              tax_id: "DE123",
            },
            score: {},
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(await screen.findByText(/Review complete, merge succeeded/i)).toBeInTheDocument();
    expect(screen.queryByText(/You can submit again to regenerate reviewed\.json/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Merge finished. Workflow reached done state.")).not.toBeInTheDocument();
  });

  it("keeps local excel label text outside clickable label container", () => {
    renderPage();
    expect(screen.getByText("Choose Local Excel").closest("label")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose File" })).toBeInTheDocument();
    expect(screen.getByText("No file selected")).toBeInTheDocument();
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

  it("renders one shared daily run date control and removes row-level date inputs", () => {
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
              tax_id: "DE123",
              run_date: "01/02/2026",
            },
            score: {},
          },
          {
            row_id: "zbon:invoice-2",
            category: "zbon",
            filename: "zbon-2.pdf",
            result: {
              brutto: "20.00",
              netto: "16.00",
              run_date: "02/02/2026",
            },
            score: {},
          },
        ],
      },
    });

    expect(screen.getByDisplayValue("2026-02-10")).toBeInTheDocument();
    expect(screen.queryByLabelText("BAR Review Items-run_date-bar:invoice-1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("ZBON Review Items-run_date-zbon:invoice-2")).not.toBeInTheDocument();
  });

  it("submits daily rows with the shared review page run date", async () => {
    const base = buildBaseContext();
    const actions = {
      ...base.actions,
      submitReviewOnly: vi.fn(async () => true),
      queueMergeOnly: vi.fn(async () => true),
      fetchReviewRows: vi.fn(async () => []),
      resolveMonthlyPathFromLocal: vi.fn(async () => "D:\\merge\\monthly.xlsx"),
      retryMerge: vi.fn(async () => true),
      reportTypeError: vi.fn(async () => ({ status: "skipped", corrections: [] })),
    };

    const context = {
      ...base,
      actions: {
        ...actions,
        setRunDate: vi.fn(),
      },
      state: {
        ...base.state,
        runDate: "14/02/2026",
        reviewRows: [
          {
            row_id: "bar:invoice-1",
            category: "bar",
            filename: "invoice-1.pdf",
            result: {
              store_name: "Store A",
              brutto: "10.00",
              netto: "8.40",
              tax_id: "DE123",
              run_date: "01/02/2026",
            },
            score: {},
          },
          {
            row_id: "zbon:invoice-2",
            category: "zbon",
            filename: "zbon-2.pdf",
            result: {
              brutto: "20.00",
              netto: "16.00",
              run_date: "02/02/2026",
            },
            score: {},
          },
        ],
      },
    };

    mockContext.mockImplementation(() => context);
    render(
      <MemoryRouter>
        <ManualReviewPage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(actions.submitReviewOnly).toHaveBeenCalled();
    });

    const submittedRows = actions.submitReviewOnly.mock.calls[0][0];
    expect(submittedRows).toHaveLength(2);
    expect(submittedRows[0].result.run_date).toBe("14/02/2026");
    expect(submittedRows[1].result.run_date).toBe("14/02/2026");
  });

  it("renders office type/receiver_ok selectors and submits updated boolean payload", async () => {
    const actions = {
      submitReviewOnly: vi.fn(async () => true),
      queueMergeOnly: vi.fn(async () => true),
      fetchReviewRows: vi.fn(async () => []),
      resolveMonthlyPathFromLocal: vi.fn(async () => "D:\\merge\\monthly.xlsx"),
      retryMerge: vi.fn(async () => true),
      reportTypeError: vi.fn(async () => ({ status: "skipped", corrections: [] })),
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
    const receiverOkSelect = screen.getByLabelText("OFFICE Review Items-receiver_ok-office:invoice-1");
    expect(typeSelect).toBeInTheDocument();
    expect(receiverOkSelect).toBeInTheDocument();
    fireEvent.change(typeSelect, { target: { value: "Miete" } });
    fireEvent.change(receiverOkSelect, { target: { value: "False" } });
    expect(receiverOkSelect).toHaveValue("False");

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => {
      expect(actions.submitReviewOnly).toHaveBeenCalled();
    });

    const submittedRows = actions.submitReviewOnly.mock.calls[0][0];
    expect(submittedRows[0].result.type).toBe("Miete");
    expect(submittedRows[0].result.receiver_ok).toBe(false);
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

  it("syncs queue state when removing a review row", () => {
    const removeFile = vi.fn();

    renderPage({
      actions: {
        ...buildBaseContext().actions,
        removeFile,
      },
      state: {
        ...buildBaseContext().state,
        reviewRows: [
          {
            row_id: "bar:invoice-2",
            category: "bar",
            filename: "a.pdf",
            result: { store_name: "Store", brutto: "10.00", netto: "8.40", run_date: "10/02/2026" },
            score: {},
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeFile).toHaveBeenCalledWith("f1");
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
