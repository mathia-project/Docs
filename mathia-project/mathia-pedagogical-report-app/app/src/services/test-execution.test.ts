import { describe, expect, it } from "vitest";
import {
  createPrng,
  deterministicShuffle,
  evaluateAnswer,
  sanitizeQuestionForStudent,
} from "./test-execution";

describe("test-execution service", () => {
  it("deterministic PRNG produces identical sequence for same seed", () => {
    const seed = "test_seed_12345";
    const prng1 = createPrng(seed);
    const prng2 = createPrng(seed);

    const seq1 = [prng1(), prng1(), prng1(), prng1()];
    const seq2 = [prng2(), prng2(), prng2(), prng2()];

    expect(seq1).toEqual(seq2);
  });

  it("deterministicShuffle reproducibly shuffles items for the same seed", () => {
    const items = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];
    const seed = "fixed_student_seed_abc";

    const shuffled1 = deterministicShuffle(items, createPrng(seed));
    const shuffled2 = deterministicShuffle(items, createPrng(seed));

    expect(shuffled1).toEqual(shuffled2);
    expect(shuffled1).not.toEqual(items); // genuinely shuffled
    expect(shuffled1.sort()).toEqual([...items].sort()); // contains same items
  });

  it("sanitizeQuestionForStudent strips all correct flags and feedback", () => {
    const rawSnapshot = {
      id: "q-1",
      prompt: "What is 5 + 7?",
      question_type: "single_choice",
      difficulty: "easy",
      language: "en",
      explanation: "Secret teacher explanation",
      options: [
        { option_key: "A", content: "11", is_correct: false, position: 1, feedback: "Almost" },
        { option_key: "B", content: "12", is_correct: true, position: 2, feedback: "Great!" },
        { option_key: "C", content: "13", is_correct: false, position: 3, feedback: "Too high" },
      ],
    };

    const sanitized = sanitizeQuestionForStudent(rawSnapshot, 1, "aq-1", ["B", "A", "C"]);

    expect(sanitized.attempt_question_id).toBe("aq-1");
    expect(sanitized.display_position).toBe(1);
    expect(sanitized.prompt).toBe("What is 5 + 7?");
    expect((sanitized as unknown as Record<string, unknown>).explanation).toBeUndefined();

    // Check options are reordered and stripped of scoring fields
    expect(sanitized.options.map((o) => o.option_key)).toEqual(["B", "A", "C"]);
    for (const opt of sanitized.options) {
      expect((opt as unknown as Record<string, unknown>).is_correct).toBeUndefined();
      expect((opt as unknown as Record<string, unknown>).feedback).toBeUndefined();
    }
  });

  describe("deterministic answer evaluation", () => {
    const singleChoiceSnapshot = {
      question_type: "single_choice",
      options: [
        { option_key: "A", content: "Option A", is_correct: false },
        { option_key: "B", content: "Option B", is_correct: true },
        { option_key: "C", content: "Option C", is_correct: false },
      ],
    };

    it("grades single_choice correctly", () => {
      const correctRes = evaluateAnswer(singleChoiceSnapshot, { selected_option_key: "B" }, 2.0);
      expect(correctRes.is_correct).toBe(true);
      expect(correctRes.score_awarded).toBe(2.0);

      const incorrectRes = evaluateAnswer(singleChoiceSnapshot, { selected_option_key: "A" }, 2.0);
      expect(incorrectRes.is_correct).toBe(false);
      expect(incorrectRes.score_awarded).toBe(0);
    });

    const multiChoiceSnapshot = {
      question_type: "multiple_choice",
      options: [
        { option_key: "A", content: "Option A", is_correct: true },
        { option_key: "B", content: "Option B", is_correct: false },
        { option_key: "C", content: "Option C", is_correct: true },
      ],
    };

    it("grades multiple_choice with exact set match", () => {
      const correctRes = evaluateAnswer(multiChoiceSnapshot, { selected_option_keys: ["C", "A"] }, 1.5);
      expect(correctRes.is_correct).toBe(true);
      expect(correctRes.score_awarded).toBe(1.5);

      const partialRes = evaluateAnswer(multiChoiceSnapshot, { selected_option_keys: ["A"] }, 1.5);
      expect(partialRes.is_correct).toBe(false);
      expect(partialRes.score_awarded).toBe(0);

      const extraRes = evaluateAnswer(multiChoiceSnapshot, { selected_option_keys: ["A", "B", "C"] }, 1.5);
      expect(extraRes.is_correct).toBe(false);
      expect(extraRes.score_awarded).toBe(0);
    });

    const numericSnapshot = {
      question_type: "numeric",
      answer_config: {
        correct_value: 42.5,
        tolerance: 0.5,
      },
      options: [],
    };

    it("grades numeric within tolerance", () => {
      const exactRes = evaluateAnswer(numericSnapshot, { numeric_value: 42.5 }, 1.0);
      expect(exactRes.is_correct).toBe(true);

      const withinTolRes = evaluateAnswer(numericSnapshot, { numeric_value: 42.8 }, 1.0);
      expect(withinTolRes.is_correct).toBe(true);

      const outOfTolRes = evaluateAnswer(numericSnapshot, { numeric_value: 43.1 }, 1.0);
      expect(outOfTolRes.is_correct).toBe(false);
    });

    it("keeps grading legacy numeric snapshots that use expected_value", () => {
      const legacySnapshot = {
        question_type: "numeric",
        answer_config: { expected_value: 10, tolerance: 0 },
        options: [],
      };

      const result = evaluateAnswer(legacySnapshot, { numeric_value: 10 }, 1.0);
      expect(result.is_correct).toBe(true);
      expect(result.score_awarded).toBe(1.0);
    });

    it("handles null or missing answers safely", () => {
      const nullRes = evaluateAnswer(singleChoiceSnapshot, null);
      expect(nullRes.is_correct).toBe(false);
      expect(nullRes.score_awarded).toBe(0);
    });
  });
});
