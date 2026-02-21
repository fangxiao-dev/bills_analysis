import { describe, expect, it } from "vitest";
import { AppHttpError, toErrorMessage } from "./http";

describe("toErrorMessage", () => {
  it("keeps dedicated 405 CORS hint", () => {
    const error = new AppHttpError("Request failed with status 405.", { status: 405 });
    expect(toErrorMessage(error)).toMatch(/CORS/i);
  });

  it("returns detail string when backend sends a plain message", () => {
    const error = new AppHttpError("Request failed with status 422.", {
      status: 422,
      details: { detail: "Validation Error" },
    });
    expect(toErrorMessage(error)).toBe("Validation Error");
  });

  it("formats FastAPI detail arrays into readable field-level message", () => {
    const error = new AppHttpError("Request failed with status 422.", {
      status: 422,
      details: {
        detail: [
          {
            type: "missing",
            loc: ["body", "rows", 0, "result", "brutto"],
            msg: "Field required",
          },
          {
            type: "string_too_short",
            loc: ["body", "rows", 0, "filename"],
            msg: "String should have at least 1 character",
          },
        ],
      },
    });

    expect(toErrorMessage(error)).toContain("body.rows.0.result.brutto: Field required");
    expect(toErrorMessage(error)).toContain("body.rows.0.filename: String should have at least 1 character");
  });
});
