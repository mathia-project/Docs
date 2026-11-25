import type {
  CreateQuestionInput,
  CurriculumCatalog,
  QuestionOptionInput,
} from "./question-bank";
import type { JsonObject, QuestionDifficulty, QuestionType } from "./schema";

export type QuestionImportFormat = "csv" | "ai_json";

export interface ParsedQuestionRow {
  row: number;
  input: CreateQuestionInput | null;
  errors: string[];
}

interface CanonicalOption {
  key: string;
  content: string;
}

interface CanonicalQuestion {
  external_id?: string | null;
  question_type?: string;
  prompt?: string;
  options?: CanonicalOption[];
  correct_options?: string[];
  explanation?: string | null;
  difficulty?: string;
  language?: string;
  curriculum?: {
    domain_code?: string;
    cluster_code?: string | null;
    standard_code?: string | null;
    substandard_code?: string | null;
  };
  answer_config?: JsonObject;
}

const QUESTION_TYPES = new Set<QuestionType>([
  "single_choice",
  "multiple_choice",
  "true_false",
  "numeric",
  "short_text",
]);
const DIFFICULTIES = new Set<QuestionDifficulty>(["easy", "medium", "hard"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function relationId(relation: string | { id: string } | null): string {
  if (!relation) return "";
  return typeof relation === "string" ? relation : relation.id;
}

function detectDelimiter(header: string): string {
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, candidate) =>
    header.split(candidate).length > header.split(best).length ? candidate : best,
  );
}

export function parseCsvRows(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "");
  const firstLineEnd = normalized.search(/\r?\n/);
  const delimiter = detectDelimiter(
    firstLineEnd === -1 ? normalized : normalized.slice(0, firstLineEnd),
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '"') {
      if (quoted && normalized[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && normalized[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error("Unclosed quoted CSV field");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvToCanonical(text: string): CanonicalQuestion[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0]!.map((header) => header.trim().toLocaleLowerCase());

  return rows.slice(1).map((values) => {
    const item = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const optionKeys = ["A", "B", "C", "D"];
    const options = optionKeys
      .map((key) => ({ key, content: item[`option_${key.toLocaleLowerCase()}`] ?? "" }))
      .filter((option) => option.content);
    return {
      external_id: item.external_id || null,
      question_type: item.question_type ?? "",
      prompt: item.prompt ?? "",
      options,
      correct_options: (item.correct_options ?? "")
        .split("|")
        .map((key) => key.trim().toLocaleUpperCase())
        .filter(Boolean),
      explanation: item.explanation || null,
      difficulty: item.difficulty ?? "",
      language: item.language ?? "",
      curriculum: {
        domain_code: item.domain_code ?? "",
        cluster_code: item.cluster_code || null,
        standard_code: item.standard_code || null,
        substandard_code: item.substandard_code || null,
      },
      answer_config:
        item.correct_value === undefined || item.correct_value === ""
          ? {}
          : {
              correct_value: Number(item.correct_value),
              tolerance: Number(item.tolerance || 0),
            },
    };
  });
}

function jsonToCanonical(text: string): CanonicalQuestion[] {
  const document: unknown = JSON.parse(text);
  if (!isRecord(document) || document.schema_version !== "1.0") {
    throw new Error("schema_version must be 1.0");
  }
  if (!Array.isArray(document.questions)) throw new Error("questions must be an array");
  return document.questions.map((question) => {
    if (!isRecord(question)) return {};
    return question as CanonicalQuestion;
  });
}

function resolveCurriculum(
  question: CanonicalQuestion,
  catalog: CurriculumCatalog,
  errors: string[],
): Pick<CreateQuestionInput, "domain_id" | "cluster_id" | "standard_id" | "substandard_id"> {
  const mapping = question.curriculum ?? {};
  const domain = catalog.domains.find(
    (item) => item.id === mapping.domain_code || item.code === mapping.domain_code,
  );
  if (!domain) errors.push("domain_code");

  const cluster = mapping.cluster_code
    ? catalog.clusters.find(
        (item) => item.id === mapping.cluster_code || item.code === mapping.cluster_code,
      )
    : undefined;
  if (mapping.cluster_code && !cluster) errors.push("cluster_code");
  if (cluster && domain && relationId(cluster.domain_id) !== domain.id) errors.push("cluster_parent");

  const alias = mapping.standard_code
    ? catalog.aliases.find((item) => item.alias === mapping.standard_code)
    : undefined;
  const aliasedStandardId = alias?.item_kind === "standard" ? relationId(alias.standard_id) : "";
  const standard = mapping.standard_code
    ? catalog.standards.find(
        (item) =>
          item.id === mapping.standard_code ||
          item.code === mapping.standard_code ||
          item.ccss_id === mapping.standard_code ||
          item.id === aliasedStandardId,
      )
    : undefined;
  if (mapping.standard_code && !standard) errors.push("standard_code");
  if (standard && cluster && relationId(standard.cluster_id) !== cluster.id) {
    errors.push("standard_parent");
  }
  if (standard && !cluster) errors.push("cluster_code");

  const subAlias = mapping.substandard_code
    ? catalog.aliases.find((item) => item.alias === mapping.substandard_code)
    : undefined;
  const aliasedSubstandardId =
    subAlias?.item_kind === "substandard" ? relationId(subAlias.substandard_id) : "";
  const substandard = mapping.substandard_code
    ? catalog.substandards.find(
        (item) =>
          item.id === mapping.substandard_code ||
          item.code === mapping.substandard_code ||
          item.ccss_id === mapping.substandard_code ||
          item.id === aliasedSubstandardId,
      )
    : undefined;
  if (mapping.substandard_code && !substandard) errors.push("substandard_code");
  if (substandard && standard && relationId(substandard.standard_id) !== standard.id) {
    errors.push("substandard_parent");
  }
  if (substandard && !standard) errors.push("standard_code");

  return {
    domain_id: domain?.id ?? "",
    cluster_id: cluster?.id ?? null,
    standard_id: standard?.id ?? null,
    substandard_id: substandard?.id ?? null,
  };
}

function normalizeQuestion(
  question: CanonicalQuestion,
  row: number,
  format: QuestionImportFormat,
  catalog: CurriculumCatalog,
): ParsedQuestionRow {
  const errors: string[] = [];
  const questionType = question.question_type as QuestionType;
  const difficulty = question.difficulty as QuestionDifficulty;
  if (!QUESTION_TYPES.has(questionType)) errors.push("question_type");
  if (!question.prompt?.trim()) errors.push("prompt");
  if (!DIFFICULTIES.has(difficulty)) errors.push("difficulty");
  if (!question.language?.match(/^[a-z]{2,3}(-[A-Z]{2})?$/)) errors.push("language");

  const curriculum = resolveCurriculum(question, catalog, errors);
  const correct = new Set((question.correct_options ?? []).map((key) => key.toLocaleUpperCase()));
  const options: QuestionOptionInput[] = (question.options ?? []).map((option, index) => ({
    option_key: option.key.toLocaleUpperCase(),
    content: option.content,
    is_correct: correct.has(option.key.toLocaleUpperCase()),
    position: index,
  }));

  const answerConfig = question.answer_config ?? {};
  if (questionType === "numeric") {
    if (typeof answerConfig.correct_value !== "number" || !Number.isFinite(answerConfig.correct_value)) {
      errors.push("correct_value");
    }
    if (
      answerConfig.tolerance !== undefined &&
      (typeof answerConfig.tolerance !== "number" || answerConfig.tolerance < 0)
    ) {
      errors.push("tolerance");
    }
  }

  const input: CreateQuestionInput = {
    external_id: question.external_id?.trim() || null,
    question_type: questionType,
    prompt: question.prompt?.trim() ?? "",
    explanation: question.explanation?.trim() || null,
    difficulty,
    language: question.language ?? "",
    visibility: "private",
    answer_config: answerConfig,
    options,
    source: format === "csv" ? "csv" : "ai",
    ...curriculum,
  };

  return { row, input: errors.length ? null : input, errors: [...new Set(errors)] };
}

export function parseQuestionImport(
  text: string,
  format: QuestionImportFormat,
  catalog: CurriculumCatalog,
): ParsedQuestionRow[] {
  if (!text.trim()) return [];
  const questions = format === "csv" ? csvToCanonical(text) : jsonToCanonical(text);
  return questions.map((question, index) => normalizeQuestion(question, index + 1, format, catalog));
}
