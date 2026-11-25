import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "./errors";

describe("extractErrorMessage", () => {
  it("extracts message from Directus error payload", () => {
    const error = {
      errors: [
        {
          message: "Field 'code' must be unique.",
          extensions: { code: "RECORD_NOT_UNIQUE" },
        },
      ],
    };
    expect(extractErrorMessage(error, "Fallback")).toBe("Field 'code' must be unique.");
  });

  it("extracts message from standard Error instance", () => {
    const error = new Error("Something went wrong");
    expect(extractErrorMessage(error, "Fallback")).toBe("Something went wrong");
  });

  it("formats FastAPI validation details without object coercion", () => {
    const error = {
      detail: [
        { loc: ["body", "standard_id"], msg: "Field required", type: "missing" },
        { loc: ["body", "quantity"], msg: "Must be less than or equal to 25", type: "less_than_equal" },
      ],
    };
    expect(extractErrorMessage(error, "Fallback")).toBe(
      "Field required. Must be less than or equal to 25",
    );
  });

  it("returns fallback when no message is found", () => {
    expect(extractErrorMessage(null, "Fallback")).toBe("Fallback");
    expect(extractErrorMessage({}, "Fallback")).toBe("Fallback");
    expect(extractErrorMessage({ errors: [] }, "Fallback")).toBe("Fallback");
  });
});

