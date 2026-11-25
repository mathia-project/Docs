import { createItem, deleteItem, readItem, readItems, updateItem } from "@directus/sdk";
import { directus } from "./directus";
import { appConfig } from "./config";
import type { Locale } from "../lib/i18n";
import type { ResourceImportResult } from "./resource-import";
import type {
  Resource,
  ResourceCurriculumAlignment,
  ResourceTargetLevel,
  ResourceType,
  PublishableStatus,
  JsonObject,
} from "./schema";

export interface AiResourceGenerationRequest {
  course_id: string;
  domain_id: string;
  cluster_id?: string | null;
  standard_id?: string | null;
  resource_type: "document" | "exercise" | "link" | "video";
  target_level: "reinforcement" | "practice" | "enrichment";
  language: Locale;
  quantity: number;
}

export interface GeneratedResourceItem {
  external_id: string;
  title: string;
  description: string;
  resource_type: "document" | "exercise" | "link" | "video";
  status: "draft";
  language: string;
  course_id?: string | null;
  category_id?: string | null;
  domain_id?: string | null;
  cluster_id?: string | null;
  standard_id?: string | null;
  target_level: "reinforcement" | "practice" | "enrichment";
  url?: string | null;
  body?: string | null;
  metadata?: Record<string, unknown>;
  generation: {
    mode: "generated" | "web_search";
    prompt?: string | null;
    model?: string | null;
    generated_at?: string | null;
    search?: {
      query: string;
      searched_at: string;
      selected_url: string;
      provider?: string | null;
      search_entry_point?: string | null;
      web_search_queries?: string[];
      results: Array<{
        url: string;
        title: string;
        publisher?: string | null;
        snippet?: string | null;
        language?: string | null;
        language_evidence?: string | null;
        resource_type?: "link" | "video" | null;
        source_url?: string | null;
      }>;
    } | null;
  };
  exercise?: {
    format: string;
    instructions: string;
    items: Array<{
      id: string;
      prompt: string;
      answer: string;
      solution: string;
      hints?: string[];
    }>;
  } | null;
}

export interface AiResourceGenerationResponse {
  schema_version: "1.0";
  resources: GeneratedResourceItem[];
}

export async function getResourceGenerationCapabilities(): Promise<{ web_search: boolean }> {
  const token = await directus.getToken();
  if (!token) throw new Error("authentication_required");
  const response = await fetch(`${appConfig.aiServiceUrl}/ai/resources/capabilities`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("resource_search_unavailable");
  return await response.json() as { web_search: boolean };
}

export async function generateAiResources(req: AiResourceGenerationRequest): Promise<AiResourceGenerationResponse> {
  const token = await directus.getToken();
  if (!token) throw new Error("authentication_required");
  const response = await fetch(`${appConfig.aiServiceUrl}/ai/resources/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(typeof errData.detail === "string" ? errData.detail : "resource_generation_provider_failed");
  }
  return (await response.json()) as AiResourceGenerationResponse;
}

export interface ImportResourceBatchInput {
  items: CreateResourceInput[];
}

export interface ResourceFilterParams {
  course_id?: string | null;
  category_id?: string | null;
  domain_id?: string | null;
  target_level?: ResourceTargetLevel | "all" | null;
  resource_type?: ResourceType | "all" | null;
  status?: PublishableStatus | "all" | null;
  search?: string;
}

export interface CreateResourceInput {
  title: string;
  description?: string | null;
  resource_type: ResourceType;
  status?: PublishableStatus;
  language?: string;
  course_id?: string | null;
  category_id?: string | null;
  domain_id?: string | null;
  cluster_id?: string | null;
  standard_id?: string | null;
  substandard_id?: string | null;
  target_level: ResourceTargetLevel;
  url?: string | null;
  body?: string | null;
  metadata?: JsonObject;
  published_at?: string | null;
}

export interface RecommendedResource {
  resource: Resource;
  priorityTier: 1 | 2 | 3;
  matchedCode: string;
  reasonKey: "substandard" | "standard" | "domain" | "general";
}

export const resourceService = {
  async listResources(params: ResourceFilterParams = {}): Promise<Resource[]> {
    const filter: Record<string, unknown> = {};

    if (params.course_id && params.course_id !== "all") {
      filter.course_id = { _eq: params.course_id };
    }
    if (params.category_id && params.category_id !== "all") {
      filter.category_id = { _eq: params.category_id };
    }
    if (params.domain_id && params.domain_id !== "all") {
      filter.domain_id = { _eq: params.domain_id };
    }
    if (params.target_level && params.target_level !== "all") {
      filter.target_level = { _eq: params.target_level };
    }
    if (params.resource_type && params.resource_type !== "all") {
      filter.resource_type = { _eq: params.resource_type };
    }
    if (params.status && params.status !== "all") {
      filter.status = { _eq: params.status };
    }
    if (params.search?.trim()) {
      filter._or = [
        { title: { _icontains: params.search.trim() } },
        { description: { _icontains: params.search.trim() } },
      ];
    }

    return (await directus.request(
      readItems("resources", {
        filter: Object.keys(filter).length > 0 ? filter : undefined,
        sort: ["-created_at"],
        limit: -1,
      }),
    )) as Resource[];
  },

  async getResource(id: string): Promise<Resource | null> {
    try {
      return (await directus.request(readItem("resources", id))) as Resource;
    } catch {
      return null;
    }
  },

  async createResource(input: CreateResourceInput): Promise<Resource> {
    const payload: Record<string, unknown> = {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      resource_type: input.resource_type,
      status: input.status || "published",
      language: input.language || "es",
      course_id: input.course_id || null,
      category_id: input.category_id || null,
      domain_id: input.domain_id || null,
      cluster_id: input.cluster_id || null,
      standard_id: input.standard_id || null,
      substandard_id: input.substandard_id || null,
      target_level: input.target_level || "practice",
      url: input.url?.trim() || null,
      body: input.body || null,
      metadata: input.metadata || {},
      published_at: input.status === "published" ? new Date().toISOString() : null,
    };

    return (await directus.request(createItem("resources", payload))) as Resource;
  },

  async updateResource(id: string, input: Partial<CreateResourceInput>): Promise<Resource> {
    const payload: Record<string, unknown> = {};

    if (input.title !== undefined) payload.title = input.title.trim();
    if (input.description !== undefined) payload.description = input.description?.trim() || null;
    if (input.resource_type !== undefined) payload.resource_type = input.resource_type;
    if (input.status !== undefined) {
      payload.status = input.status;
      if (input.status === "published" && !input.published_at) {
        payload.published_at = new Date().toISOString();
      }
    }
    if (input.language !== undefined) payload.language = input.language;
    if (input.course_id !== undefined) payload.course_id = input.course_id || null;
    if (input.category_id !== undefined) payload.category_id = input.category_id || null;
    if (input.domain_id !== undefined) payload.domain_id = input.domain_id || null;
    if (input.cluster_id !== undefined) payload.cluster_id = input.cluster_id || null;
    if (input.standard_id !== undefined) payload.standard_id = input.standard_id || null;
    if (input.substandard_id !== undefined) payload.substandard_id = input.substandard_id || null;
    if (input.target_level !== undefined) payload.target_level = input.target_level;
    if (input.url !== undefined) payload.url = input.url?.trim() || null;
    if (input.body !== undefined) payload.body = input.body || null;
    if (input.metadata !== undefined) payload.metadata = input.metadata;

    return (await directus.request(updateItem("resources", id, payload))) as Resource;
  },
  async getRecommendedResources(params: {
    courseId: string;
    weakSubstandards?: Array<{ substandardId: string; code: string }>;
    weakStandards?: Array<{ standardId: string; code: string }>;
    weakDomains?: Array<{ domainId: string; code: string }>;
    limit?: number;
  }): Promise<RecommendedResource[]> {
    const [allResources, alignments] = await Promise.all([
      directus.request(
        readItems("resources", {
          filter: { status: { _eq: "published" } },
          limit: -1,
        }),
      ) as Promise<Resource[]>,
      (directus.request(
        readItems("resource_curriculum_alignments", {
          filter: { course_id: { _eq: params.courseId } },
          limit: -1,
        }),
      ).catch(() => []) as unknown) as Promise<ResourceCurriculumAlignment[]>,
    ]);

    const resourceMap = new Map<string, Resource>();
    for (const res of allResources) {
      if (!res.course_id || res.course_id === params.courseId) {
        resourceMap.set(res.id, res);
      }
    }

    const alignmentByResource = new Map<string, ResourceCurriculumAlignment[]>();
    for (const al of alignments || []) {
      const rId = typeof al.resource_id === "object" && al.resource_id !== null ? al.resource_id.id : String(al.resource_id);
      if (!alignmentByResource.has(rId)) {
        alignmentByResource.set(rId, []);
      }
      alignmentByResource.get(rId)!.push(al);
    }

    const weakSubMap = new Map<string, string>();
    for (const ws of params.weakSubstandards || []) {
      weakSubMap.set(ws.substandardId, ws.code);
    }

    const weakStdMap = new Map<string, string>();
    for (const ws of params.weakStandards || []) {
      weakStdMap.set(ws.standardId, ws.code);
    }

    const weakDomMap = new Map<string, string>();
    for (const wd of params.weakDomains || []) {
      weakDomMap.set(wd.domainId, wd.code);
    }

    const scoredResources = new Map<string, RecommendedResource>();

    for (const [rId, res] of resourceMap.entries()) {
      const als = alignmentByResource.get(rId) || [];

      // Check Tier 1: Substandard match
      let matchedTier1: { code: string } | null = null;
      const resSubId = typeof res.substandard_id === "object" && res.substandard_id !== null ? (res.substandard_id as { id: string }).id : (res.substandard_id as string | undefined);
      if (resSubId && weakSubMap.has(resSubId)) {
        const code = weakSubMap.get(resSubId)!;
        matchedTier1 = { code };
      }
      if (!matchedTier1) {
        for (const al of als) {
          const sId = typeof al.substandard_id === "object" && al.substandard_id !== null ? (al.substandard_id as { id: string }).id : (al.substandard_id as string | undefined);
          if (sId && weakSubMap.has(sId)) {
            const code = weakSubMap.get(sId)!;
            matchedTier1 = { code };
            break;
          }
        }
      }

      if (matchedTier1) {
        scoredResources.set(rId, {
          resource: res,
          priorityTier: 1,
          matchedCode: matchedTier1.code,
          reasonKey: "substandard",
        });
        continue;
      }

      // Check Tier 2: Standard match
      let matchedTier2: { code: string } | null = null;
      const stdId = typeof res.standard_id === "object" && res.standard_id !== null ? (res.standard_id as { id: string }).id : (res.standard_id as string | undefined);
      if (stdId && weakStdMap.has(stdId)) {
        const code = weakStdMap.get(stdId)!;
        matchedTier2 = { code };
      }
      if (!matchedTier2) {
        for (const al of als) {
          const sId = typeof al.standard_id === "object" && al.standard_id !== null ? (al.standard_id as { id: string }).id : (al.standard_id as string | undefined);
          if (sId && weakStdMap.has(sId)) {
            const code = weakStdMap.get(sId)!;
            matchedTier2 = { code };
            break;
          }
        }
      }

      if (matchedTier2) {
        scoredResources.set(rId, {
          resource: res,
          priorityTier: 2,
          matchedCode: matchedTier2.code,
          reasonKey: "standard",
        });
        continue;
      }

      // Check Tier 3: Domain match or general reinforcement
      let matchedTier3: { code: string; reasonKey: "domain" | "general" } | null = null;
      const domId = typeof res.domain_id === "object" && res.domain_id !== null ? (res.domain_id as { id: string }).id : (res.domain_id as string | undefined);
      if (domId && weakDomMap.has(domId)) {
        const code = weakDomMap.get(domId)!;
        matchedTier3 = { code, reasonKey: "domain" };
      }
      if (!matchedTier3) {
        for (const al of als) {
          const dId = typeof al.domain_id === "object" && al.domain_id !== null ? (al.domain_id as { id: string }).id : (al.domain_id as string | undefined);
          if (dId && weakDomMap.has(dId)) {
            const code = weakDomMap.get(dId)!;
            matchedTier3 = { code, reasonKey: "domain" };
            break;
          }
        }
      }
      if (!matchedTier3 && res.target_level === "reinforcement") {
        matchedTier3 = { code: domId || "", reasonKey: "general" };
      }

      if (matchedTier3) {
        scoredResources.set(rId, {
          resource: res,
          priorityTier: 3,
          matchedCode: matchedTier3.code,
          reasonKey: matchedTier3.reasonKey,
        });
      }
    }

    const sorted = Array.from(scoredResources.values()).sort((a, b) => a.priorityTier - b.priorityTier);
    if (params.limit && params.limit > 0) {
      return sorted.slice(0, params.limit);
    }
    return sorted;
  },

  /**
   * Imports a batch of pre-validated resources into Directus.
   * If any item creation fails midway, compensation logic attempts to delete
   * (or archive) the created resources and raises an error indicating the rollback.
   */
  async importBatch(input: ImportResourceBatchInput): Promise<ResourceImportResult> {
    if (!input.items || input.items.length === 0) {
      throw new Error("No items to import");
    }

    // Pre-validate all items before attempting any persistence
    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i]!;
      if (!item.title || !item.title.trim()) {
        throw new Error(`Item at index ${i} is missing title`);
      }
      if (!item.resource_type) {
        throw new Error(`Item at index ${i} is missing resource_type`);
      }
      if (!item.target_level) {
        throw new Error(`Item at index ${i} is missing target_level`);
      }
      if ((item.resource_type === "link" || item.resource_type === "video") && !item.url?.trim()) {
        throw new Error(`Item at index ${i} of type ${item.resource_type} requires a valid URL`);
      }
      if (
        (item.resource_type === "document" || item.resource_type === "exercise") &&
        !item.body?.trim() &&
        !item.url?.trim()
      ) {
        throw new Error(`Item at index ${i} of type ${item.resource_type} requires body or URL`);
      }
    }

    const createdIds: string[] = [];
    const now = new Date().toISOString();

    try {
      for (const item of input.items) {
        const payload: Record<string, unknown> = {
          title: item.title.trim(),
          description: item.description?.trim() || null,
          resource_type: item.resource_type,
          status: item.status || "draft",
          language: item.language || "es",
          course_id: item.course_id || null,
          category_id: item.category_id || null,
          domain_id: item.domain_id || null,
          cluster_id: item.cluster_id || null,
          standard_id: item.standard_id || null,
          target_level: item.target_level,
          url: item.url?.trim() || null,
          body: item.body || null,
          metadata: item.metadata || {},
          published_at: item.status === "published" ? (item.published_at || now) : null,
        };

        const created = (await directus.request(createItem("resources", payload))) as { id: string };
        if (created?.id) {
          createdIds.push(created.id);
        }
      }

      return {
        total: input.items.length,
        imported: createdIds.length,
        createdIds,
      };
    } catch (error) {
      // Rollback / compensation: clean up all created resources in this batch
      for (const id of createdIds) {
        try {
          await directus.request(deleteItem("resources", id));
        } catch {
          try {
            await directus.request(updateItem("resources", id, { status: "archived" }));
          } catch {
            // Ignore secondary rollback failures
          }
        }
      }

      const originalMessage = error instanceof Error ? error.message : "Batch creation failed";
      throw new Error(`Resource batch import failed and was rolled back: ${originalMessage}`, {
        cause: error,
      });
    }
  },
};

