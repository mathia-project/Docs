import { createItem, readItem, readItems, updateItem } from "@directus/sdk";

import { directus } from "./directus";
import { appConfig } from "./config";
import { extractErrorMessage } from "../lib/errors";
import type { Locale } from "../lib/i18n";
import type {
  CurriculumCategory,
  CurriculumCluster,
  CurriculumCourse,
  CurriculumCourseDomain,
  CurriculumDomain,
  CurriculumLookupAlias,
  CurriculumStandard,
  CurriculumSubstandard,
  JsonObject,
  QuestionBankItem,
  QuestionDifficulty,
  QuestionOption,
  QuestionType,
  QuestionVisibility,
  TeacherProfile,
} from "./schema";

export interface AiQuestionGenerationRequest {
  course_id: string;
  domain_id: string;
  cluster_id?: string | null;
  standard_id: string;
  substandard_id?: string | null;
  question_type: "single_choice" | "multiple_choice" | "true_false" | "numeric";
  difficulty: "easy" | "medium" | "hard";
  language: Locale;
  quantity: number;
}

export interface GeneratedQuestionItem {
  prompt: string;
  question_type: "single_choice" | "multiple_choice" | "true_false" | "numeric";
  difficulty: string;
  language: string;
  domain_id: string;
  cluster_id?: string | null;
  standard_id?: string | null;
  substandard_id?: string | null;
  explanation?: string | null;
  options?: Array<{
    option_key: string;
    content: string;
    is_correct: boolean;
    position: number;
    feedback?: string | null;
  }>;
  answer_config?: Record<string, unknown>;
  generation_metadata?: Record<string, unknown>;
}

export interface AiQuestionGenerationResult {
  schema_version: "1.0";
  questions: Array<{
    prompt: string;
    question_type: GeneratedQuestionItem["question_type"];
    difficulty: string;
    language: string;
    explanation?: string | null;
    options?: Array<{ key: string; content: string }>;
    correct_options?: string[];
    curriculum: { domain_code: string; cluster_code: string; standard_code: string; substandard_code?: string | null };
    answer_config?: Record<string, unknown>;
  }>;
  metadata: {
    count: number;
    provider: string;
    model: string;
  };
}

export async function generateAiQuestions(req: AiQuestionGenerationRequest): Promise<AiQuestionGenerationResult> {
  const token = await directus.getToken();
  if (!token) throw new Error("No autenticado");
  const response = await fetch(`${appConfig.aiServiceUrl}/ai/questions/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(extractErrorMessage(errData, `Error del servidor: ${response.status}`));
  }
  return (await response.json()) as AiQuestionGenerationResult;
}

export interface CurriculumCatalog {
  categories: CurriculumCategory[];
  courses: CurriculumCourse[];
  domains: CurriculumDomain[];
  courseDomains: CurriculumCourseDomain[];
  clusters: CurriculumCluster[];
  standards: CurriculumStandard[];
  substandards: CurriculumSubstandard[];
  aliases: CurriculumLookupAlias[];
}

export interface QuestionOptionInput {
  option_key: string;
  content: string;
  is_correct: boolean;
  position: number;
  feedback?: string | null;
}

export interface CreateQuestionInput {
  external_id?: string | null;
  question_type: QuestionType;
  prompt: string;
  explanation?: string | null;
  difficulty: QuestionDifficulty;
  language: string;
  domain_id: string;
  cluster_id?: string | null;
  standard_id?: string | null;
  substandard_id?: string | null;
  course_id?: string | null;
  visibility: Exclude<QuestionVisibility, "global">;
  answer_config?: JsonObject;
  options?: QuestionOptionInput[];
  source?: "manual" | "csv" | "ai";
}

export interface ImportBatchInput {
  source: "csv" | "ai";
  filename?: string;
  items: CreateQuestionInput[];
}

export interface ImportBatchResult {
  batchId?: string | undefined;
  total: number;
  imported: number;
}

export interface QuestionDraftValidation {
  valid: boolean;
  errors: string[];
}

export function validateQuestionDraft(input: CreateQuestionInput): QuestionDraftValidation {
  const errors: string[] = [];
  if (!input.prompt.trim()) errors.push("prompt");
  if (!input.domain_id) errors.push("domain");
  if (input.standard_id && !input.cluster_id) errors.push("cluster");
  if (input.substandard_id && !input.standard_id) errors.push("standard");

  if (["single_choice", "multiple_choice", "true_false"].includes(input.question_type)) {
    const options = input.options ?? [];
    const completed = options.filter((option) => option.content.trim());
    const correctCount = completed.filter((option) => option.is_correct).length;
    if (completed.length < 2) errors.push("options");
    if (input.question_type === "multiple_choice" && correctCount < 1) errors.push("correctOption");
    if (
      (input.question_type === "single_choice" || input.question_type === "true_false") &&
      correctCount !== 1
    ) {
      errors.push("correctOption");
    }
    if (input.question_type === "true_false" && completed.length !== 2) {
      errors.push("trueFalseOptions");
    }
  }

  if (input.question_type === "numeric" && input.answer_config?.correct_value === undefined) {
    errors.push("numericAnswer");
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function validateQuestionPublication(
  item: {
    prompt?: string;
    domain_id?: string;
    standard_id?: string | null;
    question_type?: QuestionType;
    answer_config?: JsonObject;
    course_id?: string | null;
  },
  options?: Array<{ content?: string; is_correct?: boolean }>,
  validationOptions?: { requireStandard?: boolean },
): QuestionDraftValidation {
  const errors: string[] = [];
  if (!item.prompt?.trim()) errors.push("prompt");
  if (!item.domain_id) errors.push("domain");
  if (validationOptions?.requireStandard && !item.standard_id) {
    errors.push("standardRequired");
  }

  const qType = item.question_type || "single_choice";
  if (["single_choice", "multiple_choice", "true_false"].includes(qType)) {
    const opts = (options ?? []).filter((o) => o.content?.trim());
    const correctCount = opts.filter((o) => Boolean(o.is_correct)).length;

    if (opts.length < 2) {
      errors.push("choiceMinOptions");
    }
    if ((qType === "single_choice" || qType === "true_false") && correctCount !== 1) {
      errors.push("singleChoiceOneCorrect");
    }
    if (qType === "multiple_choice" && correctCount < 1) {
      errors.push("multipleChoiceMinOneCorrect");
    }
    if (qType === "true_false" && opts.length !== 2) {
      errors.push("trueFalseTwoOptions");
    }
  } else if (qType === "numeric") {
    const val = item.answer_config?.correct_value;
    if (val === undefined || val === null || val === "" || isNaN(Number(val))) {
      errors.push("numericValueRequired");
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export const questionBankService = {
  async getCatalog(): Promise<CurriculumCatalog> {
    const [categories, courses, domains, courseDomains, clusters, standards, substandards, aliases] = await Promise.all([
      directus.request(readItems("curriculum_categories", { sort: ["code"], limit: -1 })),
      directus.request(readItems("curriculum_courses", { sort: ["grade_level"], limit: -1 })),
      directus.request(readItems("curriculum_domains", { sort: ["code"], limit: -1 })),
      directus.request(readItems("curriculum_course_domains", { sort: ["course_id", "domain_id"], limit: -1 })),
      directus.request(readItems("curriculum_clusters", { sort: ["code"], limit: -1 })),
      directus.request(readItems("curriculum_standards", { sort: ["id"], limit: -1 })),
      directus.request(readItems("curriculum_substandards", { sort: ["id"], limit: -1 })),
      directus.request(readItems("curriculum_lookup_aliases", { sort: ["alias"], limit: -1 })),
    ]);
    return {
      categories: categories as CurriculumCategory[],
      courses: courses as CurriculumCourse[],
      domains: domains as CurriculumDomain[],
      courseDomains: courseDomains as CurriculumCourseDomain[],
      clusters: clusters as CurriculumCluster[],
      standards: standards as CurriculumStandard[],
      substandards: substandards as CurriculumSubstandard[],
      aliases: aliases as CurriculumLookupAlias[],
    };
  },

  async getQuestions(filter?: Record<string, unknown>): Promise<QuestionBankItem[]> {
    return (await directus.request(
      readItems("question_bank_items", {
        filter: filter as never,
        sort: ["-updated_at"],
        limit: -1,
      }),
    )) as QuestionBankItem[];
  },

  async getQuestion(id: string): Promise<QuestionBankItem> {
    return (await directus.request(
      readItem("question_bank_items", id),
    )) as QuestionBankItem;
  },

  async getCurrentTeacherProfile(): Promise<TeacherProfile | null> {
    const profiles = (await directus.request(
      readItems("teacher_profiles", { limit: 1 }),
    )) as TeacherProfile[];
    return profiles[0] ?? null;
  },

  async createQuestion(input: CreateQuestionInput): Promise<QuestionBankItem> {
    const validation = validateQuestionDraft(input);
    if (!validation.valid) throw new Error(`Invalid question: ${validation.errors.join(", ")}`);

    const question = (await directus.request(
      createItem("question_bank_items", {
        external_id: input.external_id?.trim() || null,
        question_type: input.question_type,
        prompt: input.prompt.trim(),
        explanation: input.explanation?.trim() || null,
        difficulty: input.difficulty,
        language: input.language,
        domain_id: input.domain_id,
        cluster_id: input.cluster_id || null,
        standard_id: input.standard_id || null,
        substandard_id: input.substandard_id || null,
        visibility: input.visibility,
        status: "draft",
        source: input.source ?? "manual",
        source_reference: null,
        answer_config: input.answer_config ?? {},
        metadata: {},
        published_at: null,
      }),
    )) as QuestionBankItem;

    const options = (input.options ?? []).filter((option) => option.content.trim());
    for (const option of options) {
      await directus.request(
        createItem("question_options", {
          question_id: question.id,
          option_key: option.option_key,
          content: option.content.trim(),
          is_correct: option.is_correct,
          position: option.position,
          feedback: option.feedback?.trim() || null,
        }),
      );
    }

    if (input.course_id && input.standard_id) {
      try {
        await directus.request(
          createItem("question_course_alignments", {
            question_id: question.id,
            course_id: input.course_id,
            domain_id: input.domain_id || null,
            standard_id: input.standard_id,
            substandard_id: input.substandard_id || null,
          }),
        );
      } catch (err) {
        console.warn("Could not save question_course_alignments:", err);
      }
    }

    return question;
  },

  async updateQuestion(id: string, input: Partial<CreateQuestionInput>): Promise<QuestionBankItem> {
    const patch: Record<string, unknown> = {};
    if (input.prompt !== undefined) patch.prompt = input.prompt.trim();
    if (input.question_type !== undefined) patch.question_type = input.question_type;
    if (input.explanation !== undefined) patch.explanation = input.explanation?.trim() || null;
    if (input.difficulty !== undefined) patch.difficulty = input.difficulty;
    if (input.language !== undefined) patch.language = input.language;
    if (input.domain_id !== undefined) patch.domain_id = input.domain_id;
    if (input.cluster_id !== undefined) patch.cluster_id = input.cluster_id || null;
    if (input.standard_id !== undefined) patch.standard_id = input.standard_id || null;
    if (input.substandard_id !== undefined) patch.substandard_id = input.substandard_id || null;
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.external_id !== undefined) patch.external_id = input.external_id?.trim() || null;
    if (input.answer_config !== undefined) patch.answer_config = input.answer_config;

    const updated = (await directus.request(
      updateItem("question_bank_items", id, patch),
    )) as QuestionBankItem;

    if (input.options && Array.isArray(input.options)) {
      const existingOptions = await this.getOptions(id);
      const existingByKey = new Map(existingOptions.map((o) => [o.option_key, o]));

      for (let i = 0; i < input.options.length; i++) {
        const opt = input.options[i];
        if (!opt || !opt.content.trim()) continue;
        const existing = existingByKey.get(opt.option_key);
        if (existing) {
          await directus.request(
            updateItem("question_options", existing.id, {
              content: opt.content.trim(),
              is_correct: opt.is_correct,
              position: opt.position ?? i,
              feedback: opt.feedback?.trim() || null,
            }),
          );
        } else {
          await directus.request(
            createItem("question_options", {
              question_id: id,
              option_key: opt.option_key,
              content: opt.content.trim(),
              is_correct: opt.is_correct,
              position: opt.position ?? i,
              feedback: opt.feedback?.trim() || null,
            }),
          );
        }
      }
    }

    if (input.course_id && input.standard_id) {
      try {
        const alignments = (await directus.request(
          readItems("question_course_alignments", {
            filter: {
              question_id: { _eq: id },
              course_id: { _eq: input.course_id },
            },
            limit: 1,
          }),
        )) as Array<{ id: string }>;

        if (alignments.length > 0 && alignments[0]) {
          await directus.request(
            updateItem("question_course_alignments", alignments[0].id, {
              standard_id: input.standard_id,
              substandard_id: input.substandard_id || null,
              domain_id: input.domain_id || null,
            }),
          );
        } else {
          await directus.request(
            createItem("question_course_alignments", {
              question_id: id,
              course_id: input.course_id,
              domain_id: input.domain_id || null,
              standard_id: input.standard_id,
              substandard_id: input.substandard_id || null,
            }),
          );
        }
      } catch (err) {
        console.warn("Could not sync question_course_alignments:", err);
      }
    }

    return updated;
  },

  async publishQuestion(id: string): Promise<QuestionBankItem> {
    const question = await this.getQuestion(id);
    const options = await this.getOptions(id);

    const domainId = typeof question.domain_id === "object" && question.domain_id
      ? (question.domain_id as { id: string }).id
      : (question.domain_id as string);

    const validation = validateQuestionPublication(
      {
        prompt: question.prompt,
        domain_id: domainId,
        question_type: question.question_type,
        answer_config: question.answer_config,
      },
      options,
    );

    if (!validation.valid) {
      throw new Error(`Cannot publish question: ${validation.errors.join(", ")}`);
    }

    return (await directus.request(
      updateItem("question_bank_items", id, {
        status: "published",
        published_at: new Date().toISOString(),
      }),
    )) as QuestionBankItem;
  },

  async archiveQuestion(id: string): Promise<QuestionBankItem> {
    return (await directus.request(
      updateItem("question_bank_items", id, {
        status: "archived",
      }),
    )) as QuestionBankItem;
  },

  async duplicateQuestion(id: string): Promise<QuestionBankItem> {
    const question = await this.getQuestion(id);
    const options = await this.getOptions(id);

    const domainId = typeof question.domain_id === "object" && question.domain_id
      ? (question.domain_id as { id: string }).id
      : (question.domain_id as string);
    const clusterId = typeof question.cluster_id === "object" && question.cluster_id
      ? (question.cluster_id as { id: string }).id
      : (question.cluster_id as string | null);
    const standardId = typeof question.standard_id === "object" && question.standard_id
      ? (question.standard_id as { id: string }).id
      : (question.standard_id as string | null);
    const substandardId = typeof question.substandard_id === "object" && question.substandard_id
      ? (question.substandard_id as { id: string }).id
      : (question.substandard_id as string | null);

    return await this.createQuestion({
      external_id: question.external_id ? `${question.external_id}-copy` : null,
      question_type: question.question_type,
      prompt: `${question.prompt} (Copy)`,
      explanation: question.explanation,
      difficulty: question.difficulty,
      language: question.language,
      domain_id: domainId,
      cluster_id: clusterId,
      standard_id: standardId,
      substandard_id: substandardId,
      visibility: question.visibility === "global" ? "school" : question.visibility,
      answer_config: question.answer_config,
      options: options.map((o) => ({
        option_key: o.option_key,
        content: o.content,
        is_correct: o.is_correct,
        position: o.position,
        feedback: o.feedback,
      })),
      source: "manual",
    });
  },

  async importBatch(input: ImportBatchInput): Promise<ImportBatchResult> {
    const total = input.items.length;
    if (total === 0) {
      throw new Error("No questions to import");
    }

    // 1. Pre-validation: atomic all-or-nothing verification
    for (let i = 0; i < total; i++) {
      const item = input.items[i];
      if (!item) continue;
      const validation = validateQuestionDraft(item);
      if (!validation.valid) {
        throw new Error(
          `Validation failed for item ${i + 1} (${item.prompt.slice(0, 30)}...): ${validation.errors.join(", ")}`,
        );
      }
    }

    let batchId: string | undefined;
    try {
      const batchRecord = (await directus.request(
        createItem("question_import_batches", {
          source: input.source,
          filename: input.filename || null,
          schema_version: "1.0",
          status: "processing",
          total_rows: total,
          valid_rows: 0,
          invalid_rows: 0,
          result_summary: { started_at: new Date().toISOString() },
        }),
      )) as { id: string };
      batchId = batchRecord.id;
    } catch {
      // If batch collection is not directly writable in Directus, proceed with tracking
    }

    const createdIds: string[] = [];

    try {
      for (let i = 0; i < total; i++) {
        const item = input.items[i]!;
        const created = await this.createQuestion(item);
        createdIds.push(created.id);
      }

      if (batchId) {
        try {
          await directus.request(
            updateItem("question_import_batches", batchId, {
              status: "completed",
              valid_rows: total,
              invalid_rows: 0,
              completed_at: new Date().toISOString(),
              result_summary: {
                imported_count: total,
                completed_at: new Date().toISOString(),
              },
            }),
          );
        } catch {
          // ignore batch update failure
        }
      }

      return {
        batchId,
        total,
        imported: total,
      };
    } catch (error) {
      // Atomic rollback: archive all partially created questions so none remain active in bank
      for (const id of createdIds) {
        try {
          await this.archiveQuestion(id);
        } catch {
          // ignore cleanup errors during rollback
        }
      }

      if (batchId) {
        try {
          await directus.request(
            updateItem("question_import_batches", batchId, {
              status: "failed",
              valid_rows: 0,
              invalid_rows: total,
              completed_at: new Date().toISOString(),
              result_summary: {
                error: error instanceof Error ? error.message : "Unknown import failure",
                aborted_at_item: createdIds.length + 1,
                rolled_back_count: createdIds.length,
              },
            }),
          );
        } catch {
          // ignore batch update failure
        }
      }

      throw new Error(
        `Import aborted and rolled back. Failed on item ${createdIds.length + 1} of ${total}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        { cause: error },
      );
    }
  },

  async getOptions(questionId: string): Promise<QuestionOption[]> {
    return (await directus.request(
      readItems("question_options", {
        filter: { question_id: { _eq: questionId } },
        sort: ["position"],
        limit: -1,
      }),
    )) as QuestionOption[];
  },
};

