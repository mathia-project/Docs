import { describe, expect, it } from "vitest";

import { parseAuthenticationData } from "./auth-storage";

describe("Directus authentication storage", () => {
  it("accepts the complete token shape returned by Directus", () => {
    expect(
      parseAuthenticationData(
        JSON.stringify({
          access_token: "access",
          refresh_token: "refresh",
          expires: 900_000,
          expires_at: 2_000_000,
        }),
      ),
    ).toEqual({
      access_token: "access",
      refresh_token: "refresh",
      expires: 900_000,
      expires_at: 2_000_000,
    });
  });

  it("rejects malformed or incomplete persisted values", () => {
    expect(parseAuthenticationData("not-json")).toBeNull();
    expect(parseAuthenticationData(JSON.stringify({ access_token: 42 }))).toBeNull();
  });
});
