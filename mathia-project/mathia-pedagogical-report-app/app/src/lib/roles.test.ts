import { describe, expect, it } from "vitest";

import { canAccess, defaultRouteForRole, roleFromName } from "./roles";

describe("role helpers", () => {
  it("maps configured Directus role names without relying on casing", () => {
    expect(roleFromName(" Student ")).toBe("student");
    expect(roleFromName("TEACHER")).toBe("teacher");
    expect(roleFromName("Director")).toBe("director");
  });

  it("rejects roles that do not belong in the SPA", () => {
    expect(roleFromName("Administrator")).toBeNull();
    expect(roleFromName("unknown")).toBeNull();
  });

  it("returns a deterministic home route for every supported role", () => {
    expect(defaultRouteForRole("student")).toBe("/student");
    expect(defaultRouteForRole("teacher")).toBe("/teacher");
    expect(defaultRouteForRole("director")).toBe("/director");
  });

  it("keeps route access explicit", () => {
    expect(canAccess("director", ["teacher", "director"])).toBe(true);
    expect(canAccess("student", ["teacher", "director"])).toBe(false);
  });
});
