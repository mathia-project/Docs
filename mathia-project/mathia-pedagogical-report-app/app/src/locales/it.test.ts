import { describe, expect, it } from "vitest";

import { en } from "./en";
import { es } from "./es";
import { it as italian } from "./it";

const placeholders = (message: string) =>
  [...message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map((match) => match[1]).sort();

describe("Italian translations", () => {
  it("covers every application message and preserves interpolation variables", () => {
    expect(Object.keys(italian).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(italian).sort()).toEqual(Object.keys(es).sort());

    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      expect(italian[key].trim(), key).not.toBe("");
      expect(placeholders(italian[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("keeps the product name and CSV field identifiers intact", () => {
    expect(italian["app.name"]).toBe("Mathia");
    expect(italian["director.students.importInstructions"]).toContain("preferred_language");
    expect(italian["director.students.importPlaceholder"]).toContain(",it,");
  });
});
