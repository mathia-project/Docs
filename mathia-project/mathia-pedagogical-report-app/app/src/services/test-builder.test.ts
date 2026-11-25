import { describe, expect, it } from "vitest";
import {
  buildQuestionSnapshot,
  compileBlueprint,
  countMatchingQuestions,
  type QuestionBankItemWithOptions,
  type TestBlueprintRuleInput,
} from "./test-builder";

function makeMockQuestion(
  id: string,
  overrides?: Partial<QuestionBankItemWithOptions>,
): QuestionBankItemWithOptions {
  return {
    id,
    school_id: "school-1",
    created_by_user_id: "user-1",
    created_by_teacher_id: "teacher-1",
    external_id: `ext-${id}`,
    question_type: "single_choice",
    prompt: `Question prompt for ${id}`,
    explanation: `Explanation for ${id}`,
    difficulty: "medium",
    language: "es",
    domain_id: "domain-1",
    cluster_id: "cluster-1",
    standard_id: "std-1",
    substandard_id: null,
    visibility: "school",
    status: "published",
    source: "manual",
    source_reference: null,
    answer_config: { tolerance: 0.1 },
    metadata: { answer_config: { tolerance: 0.1 } },
    published_at: "2026-09-06T12:00:00Z",
    created_at: "2026-09-06T10:00:00Z",
    updated_at: "2026-09-06T12:00:00Z",
    options: [
      {
        id: `opt-${id}-1`,
        school_id: "school-1",
        created_by_user_id: "user-1",
        question_id: id,
        option_key: "A",
        content: "Option A",
        is_correct: true,
        position: 1,
        feedback: "Correct answer",
        created_at: "2026-09-06T10:00:00Z",
        updated_at: "2026-09-06T12:00:00Z",
      },
      {
        id: `opt-${id}-2`,
        school_id: "school-1",
        created_by_user_id: "user-1",
        question_id: id,
        option_key: "B",
        content: "Option B",
        is_correct: false,
        position: 2,
        feedback: "Incorrect answer",
        created_at: "2026-09-06T10:00:00Z",
        updated_at: "2026-09-06T12:00:00Z",
      },
    ],
    ...overrides,
  };
}

describe("test-builder service", () => {
  it("buildQuestionSnapshot freezes prompt, options, answer_config and taxonomy", () => {
    const q = makeMockQuestion("q-100");
    const snapshot = buildQuestionSnapshot(q);

    expect(snapshot.id).toBe("q-100");
    expect(snapshot.prompt).toBe("Question prompt for q-100");
    expect(snapshot.question_type).toBe("single_choice");
    expect(snapshot.difficulty).toBe("medium");
    expect(snapshot.domain_id).toBe("domain-1");
    expect(snapshot.answer_config).toEqual({ tolerance: 0.1 });
    expect(Array.isArray(snapshot.options)).toBe(true);
    expect((snapshot.options as unknown[]).length).toBe(2);
  });

  it("compileBlueprint successfully matches criteria-based rules", () => {
    const questions = [
      makeMockQuestion("q-1", { domain_id: "6.NS", difficulty: "easy" }),
      makeMockQuestion("q-2", { domain_id: "6.NS", difficulty: "easy" }),
      makeMockQuestion("q-3", { domain_id: "6.RP", difficulty: "medium" }),
    ];

    const rules: TestBlueprintRuleInput[] = [
      {
        domain_id: "6.NS",
        difficulty: "easy",
        question_count: 2,
        section_title: "Number System",
      },
    ];

    const result = compileBlueprint({ rules, availableQuestions: questions });

    expect(result.success).toBe(true);
    expect(result.selectedQuestions.length).toBe(2);
    expect(result.totalPoints).toBe(2.0);
    expect(result.selectedQuestions[0]?.sectionTitle).toBe("Number System");
    expect(result.selectedQuestions.map((sq) => sq.question.id)).toEqual(["q-1", "q-2"]);
  });

  it("compileBlueprint successfully compiles multiple rules across different domains and difficulties", () => {
    const questions = [
      makeMockQuestion("q-ns-1", { domain_id: "6.NS", difficulty: "easy" }),
      makeMockQuestion("q-ns-2", { domain_id: "6.NS", difficulty: "easy" }),
      makeMockQuestion("q-rp-1", { domain_id: "6.RP", difficulty: "medium" }),
      makeMockQuestion("q-rp-2", { domain_id: "6.RP", difficulty: "medium" }),
      makeMockQuestion("q-ee-1", { domain_id: "6.EE", difficulty: "hard" }),
    ];

    const rules: TestBlueprintRuleInput[] = [
      {
        domain_id: "6.NS",
        difficulty: "easy",
        question_count: 2,
        section_title: "Sección 1: Sistemas Numéricos",
      },
      {
        domain_id: "6.RP",
        difficulty: "medium",
        question_count: 2,
        section_title: "Sección 2: Razones y Proporciones",
      },
      {
        domain_id: "6.EE",
        difficulty: "hard",
        question_count: 1,
        section_title: "Sección 3: Ecuaciones",
      },
    ];

    const result = compileBlueprint({ rules, availableQuestions: questions });

    expect(result.success).toBe(true);
    expect(result.selectedQuestions.length).toBe(5);
    expect(result.totalPoints).toBe(5.0);

    // Verify all 3 rules are represented in order with their corresponding sections
    expect(result.selectedQuestions[0]?.sectionTitle).toBe("Sección 1: Sistemas Numéricos");
    expect(result.selectedQuestions[1]?.sectionTitle).toBe("Sección 1: Sistemas Numéricos");
    expect(result.selectedQuestions[2]?.sectionTitle).toBe("Sección 2: Razones y Proporciones");
    expect(result.selectedQuestions[3]?.sectionTitle).toBe("Sección 2: Razones y Proporciones");
    expect(result.selectedQuestions[4]?.sectionTitle).toBe("Sección 3: Ecuaciones");

    expect(result.selectedQuestions.map((sq) => sq.question.id)).toEqual([
      "q-ns-1",
      "q-ns-2",
      "q-rp-1",
      "q-rp-2",
      "q-ee-1",
    ]);
  });

  it("compileBlueprint successfully handles manual question selection", () => {
    const questions = [
      makeMockQuestion("q-1"),
      makeMockQuestion("q-2"),
      makeMockQuestion("q-3"),
    ];

    const rules: TestBlueprintRuleInput[] = [
      {
        manual_question_ids: ["q-3", "q-1"],
        question_count: 2,
        section_title: "Selected",
      },
    ];

    const result = compileBlueprint({ rules, availableQuestions: questions });

    expect(result.success).toBe(true);
    expect(result.selectedQuestions.length).toBe(2);
    expect(result.selectedQuestions.map((sq) => sq.question.id)).toEqual(["q-3", "q-1"]);
  });

  it("only uses questions matching the test language", () => {
    const questions = [
      makeMockQuestion("q-es", { language: "es" }),
      makeMockQuestion("q-it", { language: "it" }),
    ];
    const rules: TestBlueprintRuleInput[] = [{ question_count: 1 }];

    expect(countMatchingQuestions(questions, { language: "it" })).toBe(1);
    const result = compileBlueprint({ rules, availableQuestions: questions, language: "it" });
    expect(result.success).toBe(true);
    expect(result.selectedQuestions.map((item) => item.question.id)).toEqual(["q-it"]);

    const wrongLanguage = compileBlueprint({
      rules: [{ question_count: 1, manual_question_ids: ["q-es"] }],
      availableQuestions: questions,
      language: "it",
    });
    expect(wrongLanguage.success).toBe(false);
  });

  it("compileBlueprint ignores draft or archived questions", () => {
    const questions = [
      makeMockQuestion("q-1", { domain_id: "6.NS", status: "draft" }),
      makeMockQuestion("q-2", { domain_id: "6.NS", status: "archived" }),
      makeMockQuestion("q-3", { domain_id: "6.NS", status: "published" }),
    ];

    const rules: TestBlueprintRuleInput[] = [
      {
        domain_id: "6.NS",
        question_count: 2,
      },
    ];

    const result = compileBlueprint({ rules, availableQuestions: questions });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Requires 2 questions, but only 1 matching published");
  });

  it("compileBlueprint prevents question duplication across multiple rules", () => {
    const questions = [
      makeMockQuestion("q-1", { domain_id: "6.NS", difficulty: "easy" }),
      makeMockQuestion("q-2", { domain_id: "6.NS", difficulty: "easy" }),
    ];

    const rules: TestBlueprintRuleInput[] = [
      {
        domain_id: "6.NS",
        question_count: 1,
      },
      {
        domain_id: "6.NS",
        question_count: 2, // Needs 2 more, but only 1 unused question remains
      },
    ];

    const result = compileBlueprint({ rules, availableQuestions: questions });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Requires 2 questions, but only 1 matching published questions are available");
  });

  describe("countMatchingQuestions", () => {
    const questions = [
      makeMockQuestion("q-1", { domain_id: "6.NS", difficulty: "easy", question_type: "single_choice", status: "published" }),
      makeMockQuestion("q-2", { domain_id: "6.NS", difficulty: "medium", question_type: "single_choice", status: "published" }),
      makeMockQuestion("q-3", { domain_id: "6.RP", difficulty: "easy", question_type: "multiple_choice", status: "published" }),
      makeMockQuestion("q-4", { domain_id: "6.NS", difficulty: "easy", question_type: "single_choice", status: "draft" }),
      makeMockQuestion("q-5", { domain_id: "6.NS", difficulty: "easy", question_type: "single_choice", status: "archived" }),
    ];

    it("counts only published questions matching domain", () => {
      expect(countMatchingQuestions(questions, { domain_id: "6.NS" })).toBe(2);
      expect(countMatchingQuestions(questions, { domain_id: "6.RP" })).toBe(1);
      expect(countMatchingQuestions(questions, { domain_id: "7.G" })).toBe(0);
    });

    it("filters by domain, difficulty, and question type simultaneously", () => {
      expect(countMatchingQuestions(questions, { domain_id: "6.NS", difficulty: "easy" })).toBe(1);
      expect(countMatchingQuestions(questions, { domain_id: "6.NS", difficulty: "hard" })).toBe(0);
      expect(countMatchingQuestions(questions, { question_type: "single_choice" })).toBe(2);
      expect(countMatchingQuestions(questions, { question_type: "numeric" })).toBe(0);
    });

    it("returns total published count when filter is empty", () => {
      expect(countMatchingQuestions(questions, {})).toBe(3);
    });
  });
});

