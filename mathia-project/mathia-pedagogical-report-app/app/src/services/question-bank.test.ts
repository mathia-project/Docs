import { describe, expect, it } from "vitest";

import { validateQuestionDraft, validateQuestionPublication, type CreateQuestionInput } from "./question-bank";

const baseQuestion: CreateQuestionInput = {
  question_type: "single_choice",
  prompt: "What is 2 + 2?",
  difficulty: "easy",
  language: "en",
  domain_id: "6.NS",
  cluster_id: "6.NS.A",
  standard_id: "6.NS.A.1",
  visibility: "private",
  options: [
    { option_key: "A", content: "3", is_correct: false, position: 0 },
    { option_key: "B", content: "4", is_correct: true, position: 1 },
  ],
};

describe("validateQuestionDraft", () => {
  it("accepts a complete single-choice question", () => {
    expect(validateQuestionDraft(baseQuestion)).toEqual({ valid: true, errors: [] });
  });

  it("requires a domain and prompt", () => {
    const result = validateQuestionDraft({ ...baseQuestion, prompt: " ", domain_id: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("prompt");
    expect(result.errors).toContain("domain");
  });

  it("requires exactly one correct answer for single choice", () => {
    const result = validateQuestionDraft({
      ...baseQuestion,
      options: baseQuestion.options!.map((option) => ({ ...option, is_correct: false })),
    });
    expect(result.errors).toContain("correctOption");
  });

  it("requires the full parent path for deep curriculum mappings", () => {
    const result = validateQuestionDraft({
      ...baseQuestion,
      cluster_id: null,
      standard_id: "6.NS.A.1",
    });
    expect(result.errors).toContain("cluster");
  });

  it("requires a deterministic value for numeric questions", () => {
    const result = validateQuestionDraft({
      ...baseQuestion,
      question_type: "numeric",
      options: [],
      answer_config: {},
    });
    expect(result.errors).toContain("numericAnswer");
  });
});

describe("validateQuestionPublication", () => {
  it("validates publication of a correct single_choice question", () => {
    const result = validateQuestionPublication(
      {
        prompt: "Calculate 5 * 5",
        domain_id: "6.EE",
        question_type: "single_choice",
      },
      [
        { content: "20", is_correct: false },
        { content: "25", is_correct: true },
      ],
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("fails publication if less than 2 options are provided", () => {
    const result = validateQuestionPublication(
      {
        prompt: "Calculate 5 * 5",
        domain_id: "6.EE",
        question_type: "single_choice",
      },
      [{ content: "25", is_correct: true }],
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("choiceMinOptions");
  });

  it("fails publication if multiple correct answers provided for single_choice", () => {
    const result = validateQuestionPublication(
      {
        prompt: "Calculate 5 * 5",
        domain_id: "6.EE",
        question_type: "single_choice",
      },
      [
        { content: "25", is_correct: true },
        { content: "25.0", is_correct: true },
      ],
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("singleChoiceOneCorrect");
  });

  it("fails publication if numeric question lacks correct_value", () => {
    const result = validateQuestionPublication({
      prompt: "Solve 2x = 10",
      domain_id: "6.EE",
      question_type: "numeric",
      answer_config: {},
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("numericValueRequired");
  });
});

