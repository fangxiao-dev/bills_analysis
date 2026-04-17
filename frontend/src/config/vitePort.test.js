// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveDevServerPort } from "../../vite.config.js";

describe("resolveDevServerPort", () => {
  it("defaults to self-use frontend port 5173", () => {
    expect(resolveDevServerPort({})).toBe(5173);
  });

  it("supports alternate test frontend port from env", () => {
    expect(resolveDevServerPort({ VITE_DEV_PORT: "5174" })).toBe(5174);
  });
});
