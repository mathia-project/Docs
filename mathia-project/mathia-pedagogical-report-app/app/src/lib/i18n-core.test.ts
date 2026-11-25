import { describe, expect, it } from "vitest";

import { formatMessage } from "./i18n-core";

describe("formatMessage", () => {
  it("replaces known variables", () => {
    expect(formatMessage("Welcome, {name}.", { name: "Ada" })).toBe("Welcome, Ada.");
  });

  it("preserves missing variables so translation mistakes stay visible", () => {
    expect(formatMessage("{count} results for {name}", { count: 3 })).toBe(
      "3 results for {name}",
    );
  });
});
