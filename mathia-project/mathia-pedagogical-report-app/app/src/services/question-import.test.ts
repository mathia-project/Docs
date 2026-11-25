import { describe, expect, it } from "vitest";

import type { CurriculumCatalog } from "./question-bank";
import { parseCsvRows, parseQuestionImport } from "./question-import";

const timestamps = { created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
const catalog: CurriculumCatalog = {
  categories: [{ id: "N", code: "N", name: { en: "Number", es: "Número" }, active: true, ...timestamps }],
  courses: [],
  domains: [{ id: "6.NS", category_id: "N", code: "6.NS", name: { en: "Number system", es: "Sistema numérico" }, category_assignment: "project_crosswalk", source: {}, active: true, ...timestamps }],
  courseDomains: [],
  clusters: [{ id: "6.NS.A", domain_id: "6.NS", code: "6.NS.A", name: { en: "Fractions", es: "Fracciones" }, source: {}, active: true, ...timestamps }],
  standards: [{ id: "6.NS.A.1", cluster_id: "6.NS.A", code: "6.NS.1", ccss_id: "CCSS.MATH.CONTENT.6.NS.A.1", description: { en: "Divide fractions", es: "Dividir fracciones" }, markers: {}, source: {}, notes: [], active: true, ...timestamps }],
  substandards: [],
  aliases: [{ alias: "6.NS.1", item_kind: "standard", standard_id: "6.NS.A.1", substandard_id: null, ...timestamps }],
};

describe("question import", () => {
  it("parses quoted CSV fields containing delimiters", () => {
    const rows = parseCsvRows('prompt,domain_code\n"Add 1, then 2",6.NS');
    expect(rows[1]).toEqual(["Add 1, then 2", "6.NS"]);
  });

  it("normalizes CSV into a canonical draft", () => {
    const text = [
      "external_id,question_type,prompt,option_a,option_b,correct_options,difficulty,language,domain_code,cluster_code,standard_code",
      'Q-1,single_choice,"What is 2 + 2?",3,4,B,easy,en,6.NS,6.NS.A,6.NS.1',
    ].join("\n");
    const [row] = parseQuestionImport(text, "csv", catalog);
    expect(row?.errors).toEqual([]);
    expect(row?.input?.standard_id).toBe("6.NS.A.1");
    expect(row?.input?.options?.[1]?.is_correct).toBe(true);
    expect(row?.input?.source).toBe("csv");
  });

  it("rejects inconsistent curriculum parents", () => {
    const brokenCatalog: CurriculumCatalog = {
      ...catalog,
      clusters: [{ ...catalog.clusters[0]!, domain_id: "another-domain" }],
    };
    const json = JSON.stringify({
      schema_version: "1.0",
      questions: [{
        question_type: "numeric",
        prompt: "Value?",
        difficulty: "medium",
        language: "en",
        answer_config: { correct_value: 2 },
        curriculum: { domain_code: "6.NS", cluster_code: "6.NS.A" },
      }],
    });
    expect(parseQuestionImport(json, "ai_json", brokenCatalog)[0]?.errors).toContain("cluster_parent");
  });

  it("requires the versioned AI envelope", () => {
    expect(() => parseQuestionImport('{"questions":[]}', "ai_json", catalog)).toThrow(
      "schema_version",
    );
  });
});

describe("questionBankService.importBatch", () => {
  it("aborts before persistence if any item in the batch fails pre-validation", async () => {
    const { questionBankService } = await import("./question-bank");
    const validItem = {
      question_type: "single_choice" as const,
      prompt: "Valid prompt",
      difficulty: "easy" as const,
      language: "en",
      domain_id: "6.NS",
      visibility: "private" as const,
      options: [
        { option_key: "A", content: "1", is_correct: true, position: 0 },
        { option_key: "B", content: "2", is_correct: false, position: 1 },
      ],
    };
    const invalidItem = {
      ...validItem,
      prompt: "   ", // blank prompt fails validation
    };

    await expect(
      questionBankService.importBatch({
        source: "csv",
        filename: "test.csv",
        items: [validItem, invalidItem],
      }),
    ).rejects.toThrow(/Validation failed for item 2/);
  });
});

