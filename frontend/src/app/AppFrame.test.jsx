import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import i18n, { LANGUAGE_KEY } from "../i18n";
import { AppFrame } from "./AppFrame";

describe("AppFrame i18n controls", () => {
  it("shows german labels by default when no saved language exists", async () => {
    window.localStorage.removeItem(LANGUAGE_KEY);
    await i18n.changeLanguage("de");

    render(
      <MemoryRouter>
        <AppFrame>
          <div>content</div>
        </AppFrame>
      </MemoryRouter>,
    );

    expect(screen.getByText("Upload-Verwaltung")).toBeInTheDocument();
  });

  it("switches to english and persists app.lang", async () => {
    await i18n.changeLanguage("de");

    render(
      <MemoryRouter>
        <AppFrame>
          <div>content</div>
        </AppFrame>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe("en");
    expect(screen.getByText("Upload Management")).toBeInTheDocument();
  });

  it("does not show archive or settings navigation items", async () => {
    await i18n.changeLanguage("de");

    render(
      <MemoryRouter>
        <AppFrame>
          <div>content</div>
        </AppFrame>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Archiv")).not.toBeInTheDocument();
    expect(screen.queryByText("Einstellungen")).not.toBeInTheDocument();
  });
});
