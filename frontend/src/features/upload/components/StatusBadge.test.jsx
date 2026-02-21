import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge i18n", () => {
  it("renders translated label for queued", () => {
    render(<StatusBadge status="queued" />);
    expect(screen.getByText("queued")).toBeInTheDocument();
  });

  it("renders translated label for failed", () => {
    render(<StatusBadge status="failed" />);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});
