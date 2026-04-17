import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { BillUploadPage } from "./BillUploadPage";
import { useUploadFlowContext } from "../state/UploadFlowContext";

vi.mock("../state/UploadFlowContext", () => ({
  useUploadFlowContext: vi.fn(),
}));

const mockContext = useUploadFlowContext;

/**
 * Render upload page with mocked upload-flow context.
 * @param {Partial<ReturnType<typeof buildBaseContext>>} overrides
 */
function renderPage(overrides = {}) {
  mockContext.mockReturnValue({
    ...buildBaseContext(),
    ...overrides,
  });

  return render(
    <MemoryRouter>
      <BillUploadPage />
    </MemoryRouter>,
  );
}

/**
 * Build default context shape expected by BillUploadPage.
 */
function buildBaseContext() {
  return {
    client: { mode: "real" },
    flags: { isBusy: false, canSubmitBatch: true, isDone: false },
    actions: {
      setBatchType: vi.fn(),
      setRunDate: vi.fn(),
      addFiles: vi.fn(),
      removeFile: vi.fn(),
      submitBatch: vi.fn(async () => true),
      retryPolling: vi.fn(),
      fetchReviewRows: vi.fn(async () => []),
      fetchOfficeReceiverOptions: vi.fn(async () => ({
        default_city: "Dortmund",
        options: [
          {
            city: "Dortmund",
            receiver_name: "Ramen Ippin Dortmund GmbH",
            receiver_address: "Reinoldistr.8 44135 Dortmund",
          },
          {
            city: "Kaiserslautern",
            receiver_name: "Ramen Ippin Kaiserslautern GmbH",
            receiver_address: "Reinoldistr.8 44135 Dortmund",
          },
          {
            city: "Mainz",
            receiver_name: "Ramen Ippin Göttingen GmbH",
            receiver_address: "Reinoldistr.8 44135 Dortmund",
          },
          {
            city: "Kassel",
            receiver_name: "IP Kassel GmbH",
            receiver_address: "Reinoldistr.8 44135 Dortmund",
          },
          {
            city: "Europa",
            receiver_name: "Ramen Ippin Europa GmbH",
            receiver_address: "Reinoldistr.8 44135 Dortmund",
          },
          {
            city: "Düsseldorf",
            receiver_name: "Fujigawa Food GmbH",
            receiver_address: "Dreischeibenhaus 1 40211 Düsseldorf",
          },
        ],
      })),
      setOfficeReceiverCity: vi.fn(),
    },
    state: {
      phase: "ready",
      batchType: "daily",
      runDate: "14/02/2026",
      files: [{ id: "1", name: "a.pdf", size: 10, category: "bar" }],
      reviewRows: [],
      reviewRowsLoading: false,
      officeReceiverOptions: [],
      officeReceiverDefaultCity: "Dortmund",
      officeReceiverCity: "Dortmund",
      officeReceiverLoading: false,
      officeReceiverError: "",
      batch: null,
      rejectedMessage: "",
      formError: "",
      systemError: "",
    },
  };
}

describe("BillUploadPage status messaging", () => {
  it("shows only one processing hint while backend is running", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        phase: "tracking",
        batch: { batch_id: "b1", status: "running" },
      },
    });

    expect(screen.getByText("Backend is processing this batch...")).toBeInTheDocument();
    expect(screen.queryByText(/Manual review opens when status reaches review_ready/i)).not.toBeInTheDocument();
  });

  it("shows explicit ready hint when review is ready", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        phase: "review_ready",
        batch: { batch_id: "b1", status: "review_ready" },
      },
    });

    expect(screen.getByText("Batch processing completed. You can open Manual Review now.")).toBeInTheDocument();
  });

  it("keeps retry polling icon button enabled while tracking when batch exists", () => {
    const retryPolling = vi.fn();

    renderPage({
      flags: { ...buildBaseContext().flags, isBusy: true },
      actions: { ...buildBaseContext().actions, retryPolling },
      state: {
        ...buildBaseContext().state,
        phase: "tracking",
        batch: { batch_id: "b1", status: "running" },
      },
    });

    const retryBtn = screen.getByRole("button", { name: "Retry Status Poll" });
    expect(retryBtn).toBeEnabled();
    fireEvent.click(retryBtn);
    expect(retryPolling).toHaveBeenCalledTimes(1);
  });

  it("renders office receiver city selector and read-only address field", () => {
    renderPage({
      state: {
        ...buildBaseContext().state,
        batchType: "office",
        officeReceiverOptions: [
          {
            city: "Dortmund",
            receiver_name: "Ramen Ippin Dortmund GmbH",
            receiver_address: "Reinoldistr.8 44135 Dortmund",
          },
          {
            city: "Düsseldorf",
            receiver_name: "Fujigawa Food GmbH",
            receiver_address: "Dreischeibenhaus 1 40211 Düsseldorf",
          },
        ],
        officeReceiverCity: "Dortmund",
      },
    });

    expect(screen.getByLabelText("City")).toBeInTheDocument();
    expect(screen.getByLabelText("Receiver Name")).toHaveValue("Ramen Ippin Dortmund GmbH");
    expect(screen.getByLabelText("Receiver Address")).toHaveValue("Reinoldistr.8 44135 Dortmund");
    expect(screen.getByRole("option", { name: "Düsseldorf" })).toBeInTheDocument();
  });
});
