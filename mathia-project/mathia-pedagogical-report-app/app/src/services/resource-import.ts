import {
  CANONICAL_COURSES,
  domainBelongsToCourse,
  getCategoriesForCourse,
  relationId,
} from "../lib/curriculum";
import type { CurriculumCatalog } from "./question-bank";
import type { CreateResourceInput } from "./resources";
import type {
  JsonObject,
  PublishableStatus,
  ResourceTargetLevel,
  ResourceType,
} from "./schema";

export type ResourceImportFormat = "csv" | "ai_json";

export interface ResourceImportRow {
  external_id?: string | null | undefined;
  title?: string | undefined;
  description?: string | null | undefined;
  resource_type?: string | undefined;
  status?: string | undefined;
  language?: string | undefined;
  course_id?: string | null | undefined;
  category_id?: string | null | undefined;
  domain_id?: string | null | undefined;
  cluster_id?: string | null | undefined;
  standard_id?: string | null | undefined;
  target_level?: string | undefined;
  url?: string | null | undefined;
  body?: string | null | undefined;
  metadata?: unknown;
  generation?: unknown;
  exercise?: unknown;
}

export interface ParsedResourceImportRow {
  row: number;
  input: CreateResourceInput | null;
  errors: string[];
}

export interface ResourceImportResult {
  total: number;
  imported: number;
  createdIds: string[];
}

const RESOURCE_TYPES = new Set<ResourceType>([
  "document",
  "link",
  "video",
  "audio",
  "image",
  "exercise",
  "other",
]);

const RESOURCE_STATUSES = new Set<PublishableStatus>([
  "draft",
  "published",
  "archived",
]);

const TARGET_LEVELS = new Set<ResourceTargetLevel>([
  "reinforcement",
  "practice",
  "enrichment",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidHttpUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateGeneration(value: unknown, errors: string[]): JsonObject | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    errors.push("generation");
    return null;
  }

  const mode = value.mode;
  if (mode !== "generated" && mode !== "web_search" && mode !== "provided") {
    errors.push("generation.mode");
  }

  if (mode === "generated" && typeof value.prompt !== "string" && value.prompt !== null) {
    errors.push("generation.prompt");
  }

  if (mode === "web_search") {
    if (!isRecord(value.search)) {
      errors.push("generation.search");
    } else {
      if (typeof value.search.query !== "string" || !value.search.query.trim()) {
        errors.push("generation.search.query");
      }
      if (!isValidHttpUrl(String(value.search.selected_url ?? ""))) {
        errors.push("generation.search.selected_url");
      }
      if (!Array.isArray(value.search.results) || value.search.results.length === 0) {
        errors.push("generation.search.results");
      }
    }
  }

  return value as JsonObject;
}

function validateExercise(value: unknown, errors: string[]): JsonObject | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    errors.push("exercise");
    return null;
  }
  if (
    value.format !== "guided_practice" &&
    value.format !== "worksheet" &&
    value.format !== "problem_set" &&
    value.format !== "interactive_activity"
  ) {
    errors.push("exercise.format");
  }
  if (typeof value.instructions !== "string" || !value.instructions.trim()) {
    errors.push("exercise.instructions");
  }
  if (!Array.isArray(value.items) || value.items.length === 0) {
    errors.push("exercise.items");
  } else {
    value.items.forEach((item, index) => {
      if (!isRecord(item)) {
        errors.push(`exercise.items[${index}]`);
        return;
      }
      if (typeof item.id !== "string" || !item.id.trim()) errors.push(`exercise.items[${index}].id`);
      if (typeof item.prompt !== "string" || !item.prompt.trim()) {
        errors.push(`exercise.items[${index}].prompt`);
      }
      if (typeof item.solution !== "string" || !item.solution.trim()) {
        errors.push(`exercise.items[${index}].solution`);
      }
    });
  }
  return value as JsonObject;
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

function csvToCanonical(text: string): ResourceImportRow[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0]!.map((header) => header.trim().toLowerCase());

  return rows.slice(1).map((values) => {
    const item = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    let metadata: unknown = item.metadata;
    if (typeof metadata === "string" && metadata.trim()) {
      try {
        metadata = JSON.parse(metadata.trim());
      } catch {
        // Will be caught as invalid metadata in validation
      }
    }

    return {
      external_id: item.external_id,
      title: item.title,
      description: item.description,
      resource_type: item.resource_type,
      status: item.status,
      language: item.language,
      course_id: item.course_id,
      category_id: item.category_id,
      domain_id: item.domain_id,
      cluster_id: item.cluster_id,
      standard_id: item.standard_id,
      target_level: item.target_level,
      url: item.url,
      body: item.body,
      metadata,
    };
  });
}

function jsonToCanonical(text: string): ResourceImportRow[] {
  const document: unknown = JSON.parse(text);
  if (!isRecord(document) || document.schema_version !== "1.0") {
    throw new Error('Unsupported schema_version (expected "1.0")');
  }
  if (!Array.isArray(document.resources)) {
    throw new Error('"resources" must be an array');
  }
  return document.resources.map((resource) => {
    if (!isRecord(resource)) return {};
    return resource as ResourceImportRow;
  });
}

function resolveCurriculum(
  row: ResourceImportRow,
  catalog: CurriculumCatalog,
  errors: string[],
): {
  course_id: string | null;
  category_id: string | null;
  domain_id: string | null;
  cluster_id: string | null;
  standard_id: string | null;
} {
  const rawCourse = row.course_id?.trim() || null;
  const rawCat = row.category_id?.trim() || null;
  const rawDomain = row.domain_id?.trim() || null;
  const rawCluster = row.cluster_id?.trim() || null;
  const rawStandard = row.standard_id?.trim() || null;

  // 1. Resolve Course
  let courseId: string | null = null;
  if (rawCourse) {
    const matched =
      catalog.courses?.find((c) => c.id === rawCourse) ||
      CANONICAL_COURSES.find((c) => c.id === rawCourse);
    if (matched) {
      courseId = matched.id;
    } else {
      errors.push("course_id");
    }
  }

  // 2. Resolve Category
  let categoryId: string | null = null;
  if (rawCat) {
    const matched = catalog.categories?.find((c) => c.id === rawCat || c.code === rawCat);
    if (matched) {
      categoryId = matched.id;
    } else {
      errors.push("category_id");
    }
  }

  // 3. Resolve Domain
  let domainId: string | null = null;
  let domainCategory: string | null = null;
  if (rawDomain) {
    const matched = catalog.domains?.find((d) => d.id === rawDomain || d.code === rawDomain);
    if (matched) {
      domainId = matched.id;
      domainCategory = relationId(matched.category_id) || null;
    } else {
      errors.push("domain_id");
    }
  }

  // 4. Resolve Cluster
  let clusterId: string | null = null;
  let clusterDomain: string | null = null;
  if (rawCluster) {
    const matched = catalog.clusters?.find((c) => c.id === rawCluster || c.code === rawCluster);
    if (matched) {
      clusterId = matched.id;
      clusterDomain = relationId(matched.domain_id) || null;
    } else {
      errors.push("cluster_id");
    }
  }

  // 5. Resolve Standard
  let standardId: string | null = null;
  let standardCluster: string | null = null;
  if (rawStandard) {
    const alias = catalog.aliases?.find((a) => a.alias === rawStandard);
    const aliasedStandardId = alias?.item_kind === "standard" ? relationId(alias.standard_id) : "";

    const matched = catalog.standards?.find(
      (s) =>
        s.id === rawStandard ||
        s.code === rawStandard ||
        s.ccss_id === rawStandard ||
        s.id === aliasedStandardId,
    );
    if (matched) {
      standardId = matched.id;
      standardCluster = relationId(matched.cluster_id) || null;
    } else {
      errors.push("standard_id");
    }
  }

  // Hierarchy Consistency checks
  // Category belongs to course
  if (categoryId && courseId) {
    const validCategories = getCategoriesForCourse(courseId, {
      categories: catalog.categories ?? [],
      domains: catalog.domains ?? [],
      courseDomains: catalog.courseDomains ?? [],
    });
    if (!validCategories.some((c) => c.id === categoryId || c.code === categoryId)) {
      errors.push("category_parent");
    }
  }

  // Domain belongs to Category
  if (domainId && categoryId) {
    if (domainCategory && domainCategory !== categoryId) {
      errors.push("domain_parent");
    }
  } else if (domainId && !categoryId && domainCategory) {
    // Auto-fill category if omitted
    categoryId = domainCategory;
  }

  // Domain belongs to Course
  if (domainId && courseId) {
    const inCourse = domainBelongsToCourse(domainId, courseId, catalog.courseDomains ?? []);
    if (!inCourse) {
      errors.push("domain_course");
    }
  }

  // Cluster belongs to Domain
  if (clusterId) {
    if (!domainId) {
      errors.push("domain_id");
    } else if (clusterDomain && clusterDomain !== domainId) {
      errors.push("cluster_parent");
    }
  }

  // Standard belongs to Cluster
  if (standardId) {
    if (!clusterId) {
      errors.push("cluster_id");
    } else if (standardCluster && standardCluster !== clusterId) {
      errors.push("standard_parent");
    }
  }

  return {
    course_id: courseId,
    category_id: categoryId,
    domain_id: domainId,
    cluster_id: clusterId,
    standard_id: standardId,
  };
}

export function normalizeResource(
  row: ResourceImportRow,
  rowNumber: number,
  catalog: CurriculumCatalog,
): ParsedResourceImportRow {
  const errors: string[] = [];

  const externalId = row.external_id?.trim() || null;
  if (row.external_id !== undefined && row.external_id !== null && !externalId) {
    errors.push("external_id");
  }

  // Title
  const trimmedTitle = row.title?.trim() || "";
  if (!trimmedTitle) {
    errors.push("title");
  }

  // Resource Type
  const resourceType = (row.resource_type?.trim() || "") as ResourceType;
  if (!RESOURCE_TYPES.has(resourceType)) {
    errors.push("resource_type");
  }

  // Status
  let status: PublishableStatus = "draft";
  const rawStatus = row.status?.trim() || "";
  if (rawStatus) {
    if (RESOURCE_STATUSES.has(rawStatus as PublishableStatus)) {
      status = rawStatus as PublishableStatus;
    } else {
      errors.push("status");
    }
  }

  // Language
  let language = "es";
  const rawLang = row.language?.trim() || "";
  if (rawLang) {
    if (/^[a-z]{2,3}(-[A-Z]{2})?$/.test(rawLang)) {
      language = rawLang;
    } else {
      errors.push("language");
    }
  }

  // Target Level
  const targetLevel = (row.target_level?.trim() || "") as ResourceTargetLevel;
  if (!TARGET_LEVELS.has(targetLevel)) {
    errors.push("target_level");
  }

  // Metadata
  let metadata: JsonObject = {};
  if (row.metadata !== undefined && row.metadata !== null && row.metadata !== "") {
    if (isRecord(row.metadata)) {
      metadata = row.metadata as JsonObject;
    } else {
      errors.push("metadata");
    }
  }

  const generation = validateGeneration(row.generation, errors);
  const exercise = validateExercise(row.exercise, errors);

  if (resourceType === "exercise" && generation?.mode === "generated" && !exercise) {
    errors.push("exercise");
  }

  // Keep generation provenance and structured exercise content in the existing
  // JSONB metadata column until dedicated resource columns are introduced.
  if (externalId) metadata = { ...metadata, external_id: externalId };
  if (generation) metadata = { ...metadata, generation };
  if (exercise) metadata = { ...metadata, exercise };

  // URL
  const trimmedUrl = row.url?.trim() || null;
  if (trimmedUrl) {
    if (!isValidHttpUrl(trimmedUrl)) {
      errors.push("url");
    }
  }

  // Body
  const trimmedBody = row.body?.trim() || null;

  // Content requirements per resource type
  if (resourceType === "link" || resourceType === "video") {
    if (!trimmedUrl) {
      errors.push("url");
    }
  } else if (resourceType === "document" || resourceType === "exercise") {
    if (!trimmedBody && !trimmedUrl) {
      errors.push("body");
    }
    if (generation?.mode === "generated" && !trimmedBody) {
      errors.push("body");
    }
  }

  if (generation?.mode === "web_search" && (resourceType === "link" || resourceType === "video")) {
    const search = isRecord(generation.search) ? generation.search : null;
    if (search && search.selected_url !== trimmedUrl) {
      errors.push("generation.search.selected_url");
    }
  }

  // Curriculum Resolution & Hierarchy Check
  const curriculum = resolveCurriculum(row, catalog, errors);

  const input: CreateResourceInput | null =
    errors.length > 0
      ? null
      : {
          title: trimmedTitle,
          description: row.description?.trim() || null,
          resource_type: resourceType,
          status,
          language,
          course_id: curriculum.course_id,
          category_id: curriculum.category_id,
          domain_id: curriculum.domain_id,
          cluster_id: curriculum.cluster_id,
          standard_id: curriculum.standard_id,
          target_level: targetLevel,
          url: trimmedUrl,
          body: trimmedBody,
          metadata,
          published_at: status === "published" ? new Date().toISOString() : null,
        };

  return {
    row: rowNumber,
    input,
    errors: [...new Set(errors)],
  };
}

export function parseResourceImport(
  text: string,
  format: ResourceImportFormat,
  catalog: CurriculumCatalog,
): ParsedResourceImportRow[] {
  if (!text.trim()) return [];
  const rows = format === "csv" ? csvToCanonical(text) : jsonToCanonical(text);
  return rows.map((row, index) => normalizeResource(row, index + 1, catalog));
}
