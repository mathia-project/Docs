import { createEffect, createMemo, createResource, createSignal, For, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { useI18n, type Locale } from "../../lib/i18n";
import {
  generateAiResources,
  getResourceGenerationCapabilities,
  resourceService,
  type CreateResourceInput,
  type GeneratedResourceItem,
} from "../../services/resources";
import type { CurriculumCatalog } from "../../services/question-bank";
import { CANONICAL_COURSES, formatCourseLabel, relationId } from "../../lib/curriculum";
import type { LocalizedText, ResourceTargetLevel } from "../../services/schema";
import { SearchAttribution } from "./SearchAttribution";

interface AiResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: CurriculumCatalog | null;
  onSuccess: (count: number) => void;
}

const resourceTypeKeys = {
  document: "backpack.type.document",
  exercise: "backpack.type.exercise",
  link: "backpack.type.link",
  video: "backpack.type.video",
} as const;

const targetLevelKeys = {
  reinforcement: "backpack.level.reinforcement",
  practice: "backpack.level.practice",
  enrichment: "backpack.level.enrichment",
} as const;

function getLocalized(text: LocalizedText | string | undefined | null, locale: Locale, fallback = ""): string {
  if (!text) return fallback;
  if (typeof text === "string") return text;
  const localized = text[locale];
  return typeof localized === "string" && localized ? localized : text.es || text.en || fallback;
}

function exerciseToBody(item: GeneratedResourceItem): string | null {
  if (!item.exercise) return null;
  const labels = item.language === "en"
    ? { answer: "Answer", solution: "Solution", hints: "Hints" }
    : item.language === "it"
      ? { answer: "Risposta", solution: "Soluzione", hints: "Suggerimenti" }
      : { answer: "Respuesta", solution: "Solución", hints: "Pistas" };
  const sections = [`# ${item.title}`, item.exercise.instructions];
  item.exercise.items.forEach((exerciseItem, index) => {
    sections.push(
      `## ${index + 1}. ${exerciseItem.prompt}`,
      `**${labels.answer}:** ${exerciseItem.answer}`,
      `**${labels.solution}:** ${exerciseItem.solution}`,
    );
    if (exerciseItem.hints?.length) {
      sections.push(`**${labels.hints}:** ${exerciseItem.hints.join(" | ")}`);
    }
  });
  return sections.filter((section) => section.trim()).join("\n\n");
}

export const AiResourceModal: Component<AiResourceModalProps> = (props) => {
  const { locale, t } = useI18n();

  // Form selections
  const [courseId, setCourseId] = createSignal("grade-6");
  const [domainId, setDomainId] = createSignal("");
  const [clusterId, setClusterId] = createSignal("");
  const [standardId, setStandardId] = createSignal("");
  const [resourceType, setResourceType] = createSignal<"document" | "exercise" | "link" | "video">("document");
  const [targetLevel, setTargetLevel] = createSignal<ResourceTargetLevel>("reinforcement");
  const [language, setLanguage] = createSignal<Locale>(locale());
  const [quantity, setQuantity] = createSignal(1);

  // Flow signals
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [previewItems, setPreviewItems] = createSignal<GeneratedResourceItem[]>([]);
  const [capabilities] = createResource(
    () => props.isOpen || undefined,
    async () => getResourceGenerationCapabilities().catch(() => ({ web_search: false })),
  );
  const isWebSearch = () => resourceType() === "link" || resourceType() === "video";

  createEffect(() => {
    // Changing generation parameters invalidates the previous proposal.
    void [courseId(), domainId(), clusterId(), standardId(), resourceType(), targetLevel(), language(), quantity(), props.isOpen];
    setPreviewItems([]);
    setErrorMessage(null);
  });

  createEffect(() => {
    if (props.isOpen) setLanguage(locale());
  });

  // Filtered curriculum levels
  const availableDomains = createMemo(() => {
    const cat = props.catalog;
    if (!cat) return [];
    const domainIdsForCourse = new Set(
      cat.courseDomains
        .filter((cd) => cd.course_id === courseId())
        .map((cd) => cd.domain_id),
    );
    return cat.domains.filter((d) => domainIdsForCourse.has(d.id));
  });

  const availableClusters = createMemo(() => {
    const cat = props.catalog;
    if (!cat || !domainId()) return [];
    return cat.clusters.filter((c) => relationId(c.domain_id) === domainId());
  });

  const availableStandards = createMemo(() => {
    const cat = props.catalog;
    if (!cat || !domainId()) return [];
    if (clusterId()) {
      return cat.standards.filter((s) => relationId(s.cluster_id) === clusterId());
    }
    const clusterIds = new Set(
      cat.clusters.filter((c) => relationId(c.domain_id) === domainId()).map((c) => c.id),
    );
    return cat.standards.filter((s) => clusterIds.has(relationId(s.cluster_id)));
  });

  const handleCourseChange = (id: string) => {
    setCourseId(id);
    setDomainId("");
    setClusterId("");
    setStandardId("");
  };

  const handleDomainChange = (id: string) => {
    setDomainId(id);
    setClusterId("");
    setStandardId("");
  };

  const handleGenerate = async () => {
    if (!domainId()) {
      setErrorMessage(t("aiForm.requiredDomainError"));
      return;
    }
    setErrorMessage(null);
    setPreviewItems([]);
    setIsGenerating(true);
    try {
      const res = await generateAiResources({
        course_id: courseId(),
        domain_id: domainId(),
        cluster_id: clusterId() || null,
        standard_id: standardId() || null,
        resource_type: resourceType(),
        target_level: targetLevel(),
        language: language(),
        quantity: Math.min(Math.max(1, quantity()), 5),
      });
      if (res.resources.some((item) => item.language !== language())) {
        throw new Error("generated_resource_language_mismatch");
      }
      setPreviewItems(res.resources);
    } catch (err) {
      const errorKeys = {
        resource_search_unavailable: "resources.search.unavailable",
        resource_search_no_results_in_language: "resources.search.noResults",
        resource_search_quota_exceeded: "resources.search.quota",
        resource_generation_timeout: "resources.search.timeout",
        generated_resource_language_mismatch: "resources.search.languageMismatch",
        resource_generation_provider_failed: "resources.search.failed",
      } as const;
      const key = err instanceof Error ? errorKeys[err.message as keyof typeof errorKeys] : undefined;
      setErrorMessage(key ? t(key) : t("resources.search.failed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemovePreviewItem = (index: number) => {
    setPreviewItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateTitle = (index: number, newTitle: string) => {
    setPreviewItems((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], title: newTitle };
      }
      return next;
    });
  };

  const handleSaveToBank = async () => {
    const items = previewItems();
    if (items.length === 0) return;

    setIsSaving(true);
    setErrorMessage(null);

    const mappedInputs: CreateResourceInput[] = items.map((item) => ({
      title: item.title,
      description: item.description ?? null,
      resource_type: item.resource_type,
      status: "draft",
      language: item.language,
      course_id: item.course_id ?? null,
      // Gemini may return a human label such as "mathematics" here, but
      // Directus requires the canonical curriculum category id (N/A/F/G/S).
      // The selected domain is authoritative and already carries that link.
      category_id: null,
      domain_id: item.domain_id ?? null,
      cluster_id: item.cluster_id ?? null,
      standard_id: item.standard_id ?? null,
      target_level: item.target_level,
      url: item.url ?? null,
      body: item.body?.trim() || exerciseToBody(item),
      metadata: {
        ...(item.metadata || {}),
        generation: item.generation,
        ...(item.exercise ? { exercise: item.exercise } : {}),
      } as any,
    }));

    try {
      const result = await resourceService.importBatch({
        items: mappedInputs,
      });
      props.onSuccess(result.imported);
      props.onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={() => { if (!isGenerating() && !isSaving()) props.onClose(); }}
      title={t("resources.aiGenerate.title")}
      maxWidth="3xl"
    >
      <div class="space-y-5 px-1">
        <p class="text-xs text-ink-muted">
          {t("resources.aiGenerate.description")}
        </p>

        {/* Guided Parameters Form */}
        <fieldset disabled={isGenerating() || isSaving()} class="grid min-w-0 grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl border border-line bg-canvas-soft p-4 text-xs disabled:opacity-70">
          {/* Course */}
          <div>
            <label class="block font-semibold text-ink mb-1">{t("aiForm.courseGrade")}:</label>
            <select
              value={courseId()}
              onChange={(e) => handleCourseChange(e.currentTarget.value)}
              class="w-full rounded-xl border border-line bg-white p-2 text-xs"
            >
              <For each={CANONICAL_COURSES}>
                {(c) => (
                  <option value={c.id}>
                    {formatCourseLabel(c.id, locale())}
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Domain */}
          <div>
            <label class="block font-semibold text-ink mb-1">
              {t("questions.domain")} <span class="text-danger">* ({t("aiForm.required")})</span>:
            </label>
            <select
              value={domainId()}
              onChange={(e) => handleDomainChange(e.currentTarget.value)}
              class="w-full rounded-xl border border-line bg-white p-2 text-xs font-medium"
            >
              <option value="">{t("aiForm.selectDomain")}</option>
              <For each={availableDomains()}>
                {(d) => (
                  <option value={d.id}>
                    {d.code} - {getLocalized(d.name, locale(), d.code)}
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Cluster (optional) */}
          <div>
            <label class="block font-semibold text-ink mb-1">{t("questions.cluster")} ({t("questions.form.optional")}):</label>
            <select
              value={clusterId()}
              onChange={(e) => {
                setClusterId(e.currentTarget.value);
                setStandardId("");
              }}
              disabled={!domainId()}
              class="w-full rounded-xl border border-line bg-white p-2 text-xs disabled:opacity-50"
            >
              <option value="">{t("aiForm.allClusters")}</option>
              <For each={availableClusters()}>
                {(c) => (
                  <option value={c.id}>
                    {c.code} - {getLocalized(c.name, locale(), c.code)}
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Standard (optional) */}
          <div>
            <label class="block font-semibold text-ink mb-1">{t("questions.standard")} ({t("questions.form.optional")}):</label>
            <select
              value={standardId()}
              onChange={(e) => setStandardId(e.currentTarget.value)}
              disabled={!domainId()}
              class="w-full rounded-xl border border-line bg-white p-2 text-xs disabled:opacity-50"
            >
              <option value="">{t("aiForm.allStandards")}</option>
              <For each={availableStandards()}>
                {(s) => (
                  <option value={s.id}>
                    {s.code} - {getLocalized(s.description, locale(), s.code).slice(0, 50)}...
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Resource Type */}
          <div>
            <label class="block font-semibold text-ink mb-1">{t("resources.form.resourceType")}:</label>
            <select
              value={resourceType()}
              onChange={(e) => setResourceType(e.currentTarget.value as "document" | "exercise" | "link" | "video")}
              class="w-full rounded-xl border border-line bg-white p-2 text-xs"
            >
              <option value="document">{t("aiForm.resourceDocument")}</option>
              <option value="exercise">{t("aiForm.resourceExercise")}</option>
              <option value="link" disabled={!capabilities()?.web_search}>
                {t("backpack.type.link")}
              </option>
              <option value="video" disabled={!capabilities()?.web_search}>
                {t("backpack.type.video")}
              </option>
            </select>
          </div>

          {/* Target Level */}
          <div>
            <label class="block font-semibold text-ink mb-1">{t("resources.form.targetLevel")}:</label>
            <select
              value={targetLevel()}
              onChange={(e) => setTargetLevel(e.currentTarget.value as ResourceTargetLevel)}
              class="w-full rounded-xl border border-line bg-white p-2 text-xs"
            >
              <option value="reinforcement">{t("backpack.level.reinforcement")}</option>
              <option value="practice">{t("backpack.level.practice")}</option>
              <option value="enrichment">{t("backpack.level.enrichment")}</option>
            </select>
          </div>

          {/* Language & Quantity */}
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="block font-semibold text-ink mb-1">{t("nav.language")}:</label>
              <select
                value={language()}
                onChange={(e) => setLanguage(e.currentTarget.value as Locale)}
                class="w-full rounded-xl border border-line bg-white p-2 text-xs"
              >
                <option value="es">{t("language.es")}</option>
                <option value="en">{t("language.en")}</option>
                <option value="it">{t("language.it")}</option>
              </select>
            </div>
            <div class="w-24">
              <label class="block font-semibold text-ink mb-1">{t("aiForm.quantity", { max: 5 })}:</label>
              <input
                type="number"
                min="1"
                max="5"
                value={quantity()}
                onInput={(e) => setQuantity(parseInt(e.currentTarget.value, 10) || 1)}
                class="w-full rounded-xl border border-line bg-white p-2 text-xs"
              />
            </div>
          </div>
        </fieldset>

        <p class="rounded-xl border border-line bg-canvas-soft p-3 text-xs leading-relaxed text-ink-muted">
          {capabilities.loading ? t("common.loading") : capabilities()?.web_search
            ? t("resources.search.available") : t("resources.search.unavailable")}
        </p>

        {/* Generate Action Button */}
        <div class="flex flex-wrap justify-between items-center gap-3" aria-live="polite">
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={isGenerating() || isSaving() || !domainId() || (isWebSearch() && !capabilities()?.web_search)}
          >
            <Show when={isGenerating()} fallback={<Icon name="refresh" class="size-4" />}>
              <Icon name="refresh" class="size-4 animate-spin" />
            </Show>
            <span>
              {isWebSearch()
                ? t(isGenerating() ? "resources.search.searching" : "resources.search.action")
                : t(isGenerating() ? "aiForm.generatingResource" : "aiForm.generateResource")}
            </span>
          </Button>

          <Show when={previewItems().length > 0}>
            <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
              {t("aiForm.resourcesReady", { count: previewItems().length })}
            </span>
          </Show>
        </div>

        {/* Error notification */}
        <Show when={errorMessage()}>
          <p role="alert" class="rounded-xl bg-danger-soft p-3 text-xs font-semibold text-danger">
            {errorMessage()}
          </p>
        </Show>

        {/* Preview of Generated Resources */}
        <Show when={previewItems().length > 0}>
          <div class="space-y-4 pt-4 border-t border-line">
            <h4 class="font-bold text-ink text-sm">
              {t("resources.aiGenerate.previewTitle")}
            </h4>

            <div class="space-y-3">
              <For each={previewItems()}>
                {(item, idx) => (
                  <div class="rounded-xl border border-line bg-white p-4 shadow-sm space-y-2 text-xs">
                    <div class="flex items-center justify-between">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="rounded bg-brand-soft px-2 py-0.5 font-mono text-[10px] font-bold text-brand-strong">
                          {t(resourceTypeKeys[item.resource_type])}
                        </span>
                        <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 font-semibold">
                          {t(targetLevelKeys[item.target_level])}
                        </span>
                        <span class="font-mono text-[10px] text-ink-muted">
                          {item.domain_id} · {item.language.toUpperCase()}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePreviewItem(idx())}
                        class="text-ink-muted hover:text-danger"
                        title={t("aiForm.discardResource")}
                      >
                        <Icon name="trash" class="size-4" />
                      </button>
                    </div>

                    <div>
                      <label class="block font-medium text-ink-muted mb-0.5">{t("resources.form.resourceTitle")}:</label>
                      <input
                        type="text"
                        value={item.title}
                        onInput={(e) => handleUpdateTitle(idx(), e.currentTarget.value)}
                        class="w-full rounded-lg border border-line p-2 text-xs font-semibold"
                      />
                    </div>

                    <div>
                      <p class="text-ink-muted">{item.description}</p>
                    </div>

                    <Show when={item.url}>
                      <a href={item.url!} target="_blank" rel="noopener noreferrer" class="block break-all rounded-lg border border-line p-3 text-brand-strong underline underline-offset-2">
                        {t("backpack.resource.open")} ↗<span class="mt-1 block text-[11px] text-ink-muted">{item.url}</span>
                      </a>
                    </Show>
                    <SearchAttribution generation={item.generation} />

                    {/* Markdown Body Preview */}
                    <Show when={item.body}>
                      <div class="rounded-lg bg-slate-50 p-3 max-h-48 overflow-y-auto font-mono text-xs whitespace-pre-wrap border border-slate-200">
                        {item.body}
                      </div>
                    </Show>

                    {/* Structured Exercise Preview */}
                    <Show when={item.exercise}>
                      <div class="rounded-lg bg-emerald-50/50 p-3 border border-emerald-200 space-y-2">
                        <span class="font-semibold text-emerald-900">
                          {item.exercise?.instructions}
                        </span>
                        <For each={item.exercise?.items}>
                          {(exItem) => (
                            <div class="rounded bg-white p-2.5 border border-emerald-100 space-y-1">
                              <p class="font-medium text-ink">{t("questions.form.prompt")}: {exItem.prompt}</p>
                              <p class="text-emerald-700 font-semibold">{t("aiForm.answer")}: {exItem.answer}</p>
                              <p class="text-ink-muted italic">{t("aiForm.solution")}: {exItem.solution}</p>
                              <Show when={exItem.hints && exItem.hints.length > 0}>
                                <p class="text-slate-500">{t("aiForm.hints")}: {exItem.hints?.join(" | ")}</p>
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>

      <div class="mt-6 flex flex-wrap justify-end gap-3 pt-4 border-t border-line">
        <Button variant="secondary" onClick={props.onClose} disabled={isSaving() || isGenerating()}>
          {t("common.cancel")}
        </Button>
        <Show when={previewItems().length > 0}>
          <Button
            variant="primary"
            onClick={handleSaveToBank}
            disabled={isSaving() || isGenerating() || previewItems().length === 0 || previewItems().some((item) => !item.title.trim())}
          >
            <Show when={isSaving()} fallback={<Icon name="check" class="size-4" />}>
              <Icon name="refresh" class="size-4 animate-spin" />
            </Show>
            <span>
              {isSaving()
                ? t("common.loading")
                : t("resources.aiGenerate.saveConfirm")}
            </span>
          </Button>
        </Show>
      </div>
    </Modal>
  );
};
