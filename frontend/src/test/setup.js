import "@testing-library/jest-dom/vitest";
import i18n from "../i18n";

beforeEach(() => {
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem("app.lang", "en");
  }
  void i18n.changeLanguage("en");
});
