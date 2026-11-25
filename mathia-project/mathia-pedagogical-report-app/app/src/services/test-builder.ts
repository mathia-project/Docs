import {
  createItem,
  deleteItem,
  readItem,
  readItems,
  updateItem,
} from "@directus/sdk";
import { directus } from "./directus";
import type {
  JsonObject,
  QuestionBankItem,
  QuestionDifficulty,
  QuestionOption,
  QuestionType,
  TestBlueprintRule,
  TestRecord,
  TestSection,
  TestVersion,
} from "./schema";

export interface QuestionBankItemWithOptions extends QuestionBankItem {
  options: QuestionOption[];
}

export interface TestBlueprintRuleInput {
  id?: string;
  test_id?: string;
  section_title?: string | null;
  category_id?: string | null;
  domain_id?: string | null;
  cluster_id?: string | null;
  standard_id?: string | null;
  substandard_id?: string | null;
  difficulty?: QuestionDifficulty | null;
  question_type?: QuestionType | null;
  question_count: number;
  manual_question_ids?: string[] | null;
  position?: number;
}

export interface CompileBlueprintInput {
  rules: Array<TestBlueprintRuleInput | TestBlueprintRule>;
  availableQuestions: QuestionBankItemWithOptions[];
  language?: string;
  seed?: number;
}

export interface CompiledQuestion {
  question: QuestionBankItemWithOptions;
  sectionTitle: string;
  points: number;
}

export interface CompileBlueprintResult {
  success: boolean;
  selectedQuestions: CompiledQuestion[];
  errors: string[];
  totalPoints: number;
}

export interface CreateTestInput {
  title: string;
  description?: string | null;
  instructions?: string | null;
  language?: string;
  duration_minutes?: number | null;
  max_attempts?: number;
  rules?: TestBlueprintRuleInput[];
}

/**
 * Builds the immutable JSONB snapshot of a question at publication time.
 */
export function buildQuestionSnapshot(question: QuestionBankItemWithOptions): JsonObject {
  const domainId = typeof question.domain_id === "object" ? question.domain_id.id : question.domain_id;
  const clusterId = typeof question.cluster_id === "object" ? question.cluster_id?.id ?? null : question.cluster_id ?? null;
  const standardId = typeof question.standard_id === "object" ? question.standard_id?.id ?? null : question.standard_id ?? null;
  const substandardId = typeof question.substandard_id === "object" ? question.substandard_id?.id ?? null : question.substandard_id ?? null;

  return {
    id: question.id,
    prompt: question.prompt,
    question_type: question.question_type,
    explanation: question.explanation,
    difficulty: question.difficulty,
    language: question.language,
    domain_id: domainId,
    cluster_id: clusterId,
    standard_id: standardId,
    substandard_id: substandardId,
    options: (question.options || []).map((opt) => ({
      id: opt.id,
      option_key: opt.option_key,
      content: opt.content,
      is_correct: opt.is_correct,
      position: opt.position,
      feedback: opt.feedback ?? null,
    })),
    answer_config: (question.answer_config ?? (question.metadata as Record<string, unknown> | undefined)?.answer_config) ?? null,
  } as unknown as JsonObject;
}

export interface QuestionCriteriaFilter {
  language?: string | null;
  domain_id?: string | null;
  cluster_id?: string | null;
  standard_id?: string | null;
  substandard_id?: string | null;
  difficulty?: QuestionDifficulty | null;
  question_type?: QuestionType | null;
}

/**
 * Counts the number of published questions matching given criteria.
 */
export function countMatchingQuestions(
  availableQuestions: QuestionBankItem[],
  filter: QuestionCriteriaFilter,
): number {
  return availableQuestions.filter((q) => {
    if (q.status !== "published") return false;
    if (filter.language && q.language !== filter.language) return false;
    const qDomainId =
      typeof q.domain_id === "object" && q.domain_id
        ? (q.domain_id as { id: string }).id
        : q.domain_id;
    const qClusterId =
      typeof q.cluster_id === "object" && q.cluster_id
        ? (q.cluster_id as { id: string }).id
        : q.cluster_id;
    const qStandardId =
      typeof q.standard_id === "object" && q.standard_id
        ? (q.standard_id as { id: string }).id
        : q.standard_id;
    const qSubstandardId =
      typeof q.substandard_id === "object" && q.substandard_id
        ? (q.substandard_id as { id: string }).id
        : q.substandard_id;

    if (filter.domain_id && qDomainId !== filter.domain_id) return false;
    if (filter.cluster_id && qClusterId !== filter.cluster_id) return false;
    if (filter.standard_id && qStandardId !== filter.standard_id) return false;
    if (filter.substandard_id && qSubstandardId !== filter.substandard_id) return false;
    if (filter.difficulty && q.difficulty !== filter.difficulty) return false;
    if (filter.question_type && q.question_type !== filter.question_type) return false;
    return true;
  }).length;
}

/**
 * Compiles test blueprint rules against a set of published questions.
 * Ensures rules are satisfied without question duplication across rules.
 */
export function compileBlueprint(input: CompileBlueprintInput): CompileBlueprintResult {
  const { rules, availableQuestions, language } = input;
  const errors: string[] = [];
  const selectedQuestions: CompiledQuestion[] = [];
  const usedQuestionIds = new Set<string>();

  // Questions must be published to be eligible
  const publishedQuestions = availableQuestions.filter(
    (q) => q.status === "published" && (!language || q.language === language),
  );

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule) continue;
    const ruleIndex = i + 1;
    const sectionTitle = rule.section_title || "General";

    // 1. Manual question selection
    if (rule.manual_question_ids && rule.manual_question_ids.length > 0) {
      for (const qId of rule.manual_question_ids) {
        if (usedQuestionIds.has(qId)) {
          errors.push(`Rule #${ruleIndex}: Question ${qId} is duplicated in blueprint.`);
          continue;
        }

        const found = publishedQuestions.find((q) => q.id === qId);
        if (!found) {
          errors.push(`Rule #${ruleIndex}: Question ${qId} not found or not published in bank.`);
          continue;
        }

        usedQuestionIds.add(found.id);
        selectedQuestions.push({
          question: found,
          sectionTitle,
          points: 1.0,
        });
      }
      continue;
    }

    // 2. Criteria-based selection
    const requiredCount = rule.question_count ?? 1;
    if (requiredCount <= 0) {
      continue;
    }

    const targetDomainId = typeof rule.domain_id === "object" ? rule.domain_id?.id : rule.domain_id;
    const targetClusterId = typeof rule.cluster_id === "object" ? rule.cluster_id?.id : rule.cluster_id;
    const targetStandardId = typeof rule.standard_id === "object" ? rule.standard_id?.id : rule.standard_id;
    const targetSubstandardId = typeof rule.substandard_id === "object" ? rule.substandard_id?.id : rule.substandard_id;

    const matches = publishedQuestions.filter((q) => {
      if (usedQuestionIds.has(q.id)) return false;

      const qDomainId = typeof q.domain_id === "object" ? q.domain_id.id : q.domain_id;
      const qClusterId = typeof q.cluster_id === "object" ? q.cluster_id?.id : q.cluster_id;
      const qStandardId = typeof q.standard_id === "object" ? q.standard_id?.id : q.standard_id;
      const qSubstandardId = typeof q.substandard_id === "object" ? q.substandard_id?.id : q.substandard_id;

      if (targetDomainId && qDomainId !== targetDomainId) return false;
      if (targetClusterId && qClusterId !== targetClusterId) return false;
      if (targetStandardId && qStandardId !== targetStandardId) return false;
      if (targetSubstandardId && qSubstandardId !== targetSubstandardId) return false;
      if (rule.difficulty && q.difficulty !== rule.difficulty) return false;
      if (rule.question_type && q.question_type !== rule.question_type) return false;
      return true;
    });

    if (matches.length < requiredCount) {
      errors.push(
        `Rule #${ruleIndex}: Requires ${requiredCount} questions, but only ${matches.length} matching published questions are available.`,
      );
      continue;
    }

    // Pick requiredCount items deterministically
    const selected = matches.slice(0, requiredCount);
    for (const q of selected) {
      usedQuestionIds.add(q.id);
      selectedQuestions.push({
        question: q,
        sectionTitle,
        points: 1.0,
      });
    }
  }

  if (selectedQuestions.length === 0 && errors.length === 0) {
    errors.push("Test blueprint must specify at least one question rule.");
  }

  const totalPoints = selectedQuestions.reduce((acc, q) => acc + q.points, 0);

  return {
    success: errors.length === 0,
    selectedQuestions,
    errors,
    totalPoints,
  };
}

export const testBuilderService = {
  async getTests(): Promise<TestRecord[]> {
    return (await directus.request(
      readItems("tests", {
        sort: ["-created_at"],
        limit: -1,
      }),
    )) as TestRecord[];
  },

  async getTest(id: string): Promise<TestRecord | null> {
    try {
      return (await directus.request(readItem("tests", id))) as TestRecord;
    } catch {
      return null;
    }
  },

  async getRules(testId: string): Promise<TestBlueprintRule[]> {
    return (await directus.request(
      readItems("test_blueprint_rules", {
        filter: { test_id: { _eq: testId } },
        sort: ["position", "created_at"],
        limit: -1,
      }),
    )) as TestBlueprintRule[];
  },

  async createRule(input: TestBlueprintRuleInput): Promise<TestBlueprintRule> {
    if (!input.test_id) {
      throw new Error("test_id is required to create a blueprint rule");
    }
    return (await directus.request(
      createItem("test_blueprint_rules", {
        test_id: input.test_id,
        section_title: input.section_title ?? "General",
        domain_id: input.domain_id ?? null,
        cluster_id: input.cluster_id ?? null,
        standard_id: input.standard_id ?? null,
        substandard_id: input.substandard_id ?? null,
        difficulty: input.difficulty ?? null,
        question_type: input.question_type ?? null,
        question_count: input.question_count,
        manual_question_ids: input.manual_question_ids ?? [],
        position: input.position ?? 1,
      }),
    )) as TestBlueprintRule;
  },

  async updateRule(
    ruleId: string,
    input: Partial<TestBlueprintRuleInput>,
  ): Promise<TestBlueprintRule> {
    const patch: Record<string, unknown> = {};
    if (input.section_title !== undefined) patch.section_title = input.section_title || "General";
    if (input.category_id !== undefined) patch.category_id = input.category_id || null;
    if (input.domain_id !== undefined) patch.domain_id = input.domain_id || null;
    if (input.cluster_id !== undefined) patch.cluster_id = input.cluster_id || null;
    if (input.standard_id !== undefined) patch.standard_id = input.standard_id || null;
    if (input.substandard_id !== undefined) patch.substandard_id = input.substandard_id || null;
    if (input.difficulty !== undefined) patch.difficulty = input.difficulty || null;
    if (input.question_type !== undefined) patch.question_type = input.question_type || null;
    if (input.question_count !== undefined) patch.question_count = input.question_count;
    if (input.manual_question_ids !== undefined) patch.manual_question_ids = input.manual_question_ids;
    if (input.position !== undefined) patch.position = input.position;

    return (await directus.request(
      updateItem("test_blueprint_rules", ruleId, patch),
    )) as TestBlueprintRule;
  },

  async deleteRule(ruleId: string): Promise<void> {
    await directus.request(deleteItem("test_blueprint_rules", ruleId));
  },

  async getVersions(testId: string): Promise<TestVersion[]> {
    return (await directus.request(
      readItems("test_versions", {
        filter: { test_id: { _eq: testId } },
        sort: ["-version_number"],
        limit: -1,
      }),
    )) as TestVersion[];
  },

  async createTest(input: CreateTestInput): Promise<TestRecord> {
    const createdTest = (await directus.request(
      createItem("tests", {
        title: input.title,
        description: input.description ?? null,
        instructions: input.instructions ?? null,
        status: "draft",
        language: input.language ?? "es",
        duration_minutes: input.duration_minutes ?? null,
        max_attempts: input.max_attempts ?? 1,
        max_score: null,
        definition: {},
        published_at: null,
      }),
    )) as TestRecord;

    if (input.rules && input.rules.length > 0) {
      for (let i = 0; i < input.rules.length; i++) {
        const rule = input.rules[i];
        if (!rule) continue;
        await directus.request(
          createItem("test_blueprint_rules", {
            test_id: createdTest.id,
            section_title: rule.section_title ?? "General",
            category_id: rule.category_id ?? null,
            domain_id: rule.domain_id ?? null,
            cluster_id: rule.cluster_id ?? null,
            standard_id: rule.standard_id ?? null,
            substandard_id: rule.substandard_id ?? null,
            difficulty: rule.difficulty ?? null,
            question_type: rule.question_type ?? null,
            question_count: rule.question_count,
            manual_question_ids: rule.manual_question_ids ?? [],
            position: rule.position ?? i + 1,
          }),
        );
      }
    }

    return createdTest;
  },

  async updateTest(
    testId: string,
    input: Partial<CreateTestInput>,
  ): Promise<TestRecord> {
    const patch: Record<string, unknown> = {};
    if (input.title !== undefined) patch.title = input.title.trim();
    if (input.description !== undefined) patch.description = input.description?.trim() || null;
    if (input.instructions !== undefined) patch.instructions = input.instructions?.trim() || null;
    if (input.duration_minutes !== undefined) patch.duration_minutes = input.duration_minutes || null;
    if (input.max_attempts !== undefined) patch.max_attempts = input.max_attempts || 1;
    if (input.language !== undefined) patch.language = input.language;

    return (await directus.request(
      updateItem("tests", testId, patch),
    )) as TestRecord;
  },

  async archiveTest(testId: string): Promise<TestRecord> {
    return (await directus.request(
      updateItem("tests", testId, {
        status: "archived",
      }),
    )) as TestRecord;
  },

  async unarchiveTest(testId: string): Promise<TestRecord> {
    return (await directus.request(
      updateItem("tests", testId, {
        status: "draft",
      }),
    )) as TestRecord;
  },

  async publishTestVersion(testId: string): Promise<{ version: TestVersion; questionsCount: number; maxScore: number }> {
    const test = await this.getTest(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found.`);
    }

    const rules = await this.getRules(testId);
    if (rules.length === 0) {
      throw new Error("Cannot publish test: no blueprint rules defined.");
    }

    // Fetch published questions with options
    const [questions, options] = await Promise.all([
      directus.request(
        readItems("question_bank_items", {
          filter: { status: { _eq: "published" } },
          limit: -1,
        }),
      ) as Promise<QuestionBankItem[]>,
      directus.request(
        readItems("question_options", {
          sort: ["position"],
          limit: -1,
        }),
      ) as Promise<QuestionOption[]>,
    ]);

    const optionsByQuestion = new Map<string, QuestionOption[]>();
    for (const opt of options) {
      const qId = typeof opt.question_id === "object" ? opt.question_id.id : opt.question_id;
      if (!optionsByQuestion.has(qId)) {
        optionsByQuestion.set(qId, []);
      }
      optionsByQuestion.get(qId)!.push(opt);
    }

    const questionsWithOptions: QuestionBankItemWithOptions[] = questions.map((q) => ({
      ...q,
      options: optionsByQuestion.get(q.id) || [],
    }));

    // Compile blueprint
    const compiled = compileBlueprint({
      rules,
      availableQuestions: questionsWithOptions,
      language: test.language,
    });

    if (!compiled.success) {
      throw new Error(`Failed to compile test blueprint:\n- ${compiled.errors.join("\n- ")}`);
    }

    // Determine next version number
    const existingVersions = await this.getVersions(testId);
    const nextVersionNumber = existingVersions.reduce((max, v) => Math.max(max, v.version_number), 0) + 1;

    // Create immutable test_version record
    const publishedAt = new Date().toISOString();
    const version = (await directus.request(
      createItem("test_versions", {
        test_id: test.id,
        version_number: nextVersionNumber,
        instructions: test.instructions,
        language: test.language,
        duration_minutes: test.duration_minutes,
        max_attempts: test.max_attempts,
        shuffle_questions: true,
        shuffle_options: true,
        status: "published",
        max_score: compiled.totalPoints,
        published_at: publishedAt,
      }),
    )) as TestVersion;

    // Group sections and create test_sections
    const sectionNames = Array.from(new Set(compiled.selectedQuestions.map((q) => q.sectionTitle)));
    const sectionMap = new Map<string, string>();

    for (let sIdx = 0; sIdx < sectionNames.length; sIdx++) {
      const title = sectionNames[sIdx] ?? "General";
      const section = (await directus.request(
        createItem("test_sections", {
          test_version_id: version.id,
          title,
          position: sIdx + 1,
        }),
      )) as TestSection;
      sectionMap.set(title, section.id);
    }

    // Create immutable test_version_questions
    for (let qIdx = 0; qIdx < compiled.selectedQuestions.length; qIdx++) {
      const item = compiled.selectedQuestions[qIdx];
      if (!item) continue;
      const sectionId = sectionMap.get(item.sectionTitle) || null;
      const snapshot = buildQuestionSnapshot(item.question);

      await directus.request(
        createItem("test_version_questions", {
          test_version_id: version.id,
          question_id: item.question.id,
          section_id: sectionId,
          canonical_position: qIdx + 1,
          points: item.points,
          question_snapshot: snapshot,
        }),
      );
    }

    // Update parent test status and max_score
    await directus.request(
      updateItem("tests", test.id, {
        status: "published",
        max_score: compiled.totalPoints,
        published_at: publishedAt,
      }),
    );

    return {
      version,
      questionsCount: compiled.selectedQuestions.length,
      maxScore: compiled.totalPoints,
    };
  },
};
