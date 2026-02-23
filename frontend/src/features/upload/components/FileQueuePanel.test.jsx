import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileQueuePanel } from "./FileQueuePanel.jsx";

describe("FileQueuePanel warning popover", () => {
  it("keeps status bound to filename after queue item deletion changes index", () => {
    render(
      <FileQueuePanel
        files={[{ id: "f-b", name: "b.pdf", size: 1024, category: "office" }]}
        onRemove={vi.fn()}
        batchInputs={[
          {
            path: "01_a.pdf",
            status: "failed",
            error: "a failed",
          },
          {
            path: "02_b.pdf",
            status: "extracted",
            error: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("extracted")).toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });

  it("shows skipped warning icon immediately from input status even before skip_reason is loaded", () => {
    render(
      <FileQueuePanel
        files={[{ id: "f0", name: "pending_skip.pdf", size: 1024, category: "office" }]}
        onRemove={vi.fn()}
        batchInputs={[
          {
            path: "pending_skip.pdf",
            status: "skipped",
            error: null,
          },
        ]}
      />,
    );

    const skipIcon = screen.getByRole("button", { name: "View skip reason" });
    fireEvent.click(skipIcon);
    expect(
      screen.getByText("Skipped for auto extraction. Submit the batch first, then manually enter in review."),
    ).toBeInTheDocument();
  });

  it("shows failed reason icon and popover from backend input error", () => {
    render(
      <FileQueuePanel
        files={[{ id: "f1", name: "bad.pdf", size: 1024, category: "office" }]}
        onRemove={vi.fn()}
        batchInputs={[
          {
            path: "bad.pdf",
            status: "failed",
            error: "file processing timeout (180.0s)",
          },
        ]}
      />,
    );

    const failedIcon = screen.getByRole("button", { name: "View failure reason" });
    fireEvent.click(failedIcon);
    expect(screen.getByText("file processing timeout (180.0s)")).toBeInTheDocument();
  });

  it("keeps skipped warning popover behavior unchanged", () => {
    render(
      <FileQueuePanel
        files={[{ id: "f2", name: "skip.pdf", size: 1024, category: "office" }]}
        onRemove={vi.fn()}
        batchInputs={[
          {
            path: "skip.pdf",
            status: "extracted",
            error: null,
          },
        ]}
        skipReasonByName={new Map([["skip.pdf", "page_count=6 > max_pages=4"]])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View skip reason" }));
    expect(
      screen.getByText("Exceeded max page limit 4. Submit the batch first, then manually enter in review."),
    ).toBeInTheDocument();
  });
});
