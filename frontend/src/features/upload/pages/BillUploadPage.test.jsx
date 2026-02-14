import { render, screen } from "@testing-library/react";
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
    },
    state: {
      phase: "ready",
      batchType: "daily",
      runDate: "14/02/2026",
      files: [{ id: "1", name: "a.pdf", size: 10, category: "bar" }],
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
});
