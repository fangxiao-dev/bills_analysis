import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RunDatePicker } from "./RunDatePicker";

describe("RunDatePicker", () => {
  it("renders current run date in native date format", () => {
    render(<RunDatePicker value="14/02/2026" onChange={() => {}} />);
    expect(screen.getByDisplayValue("2026-02-14")).toBeInTheDocument();
  });

  it("maps selected native date back to DD/MM/YYYY", () => {
    const onChange = vi.fn();
    render(<RunDatePicker value="14/02/2026" onChange={onChange} />);

    const input = screen.getByDisplayValue("2026-02-14");
    fireEvent.change(input, { target: { value: "2026-02-20" } });

    expect(onChange).toHaveBeenCalledWith("20/02/2026");
  });

  it("prevents free typing into date input", () => {
    render(<RunDatePicker value="14/02/2026" onChange={() => {}} />);
    const input = screen.getByDisplayValue("2026-02-14");
    const event = createEvent.keyDown(input, { key: "1" });
    fireEvent(input, event);

    expect(event.defaultPrevented).toBe(true);
  });
});
