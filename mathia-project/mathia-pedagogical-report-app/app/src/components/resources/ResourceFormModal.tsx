import { createEffect, createMemo, createResource, createSignal, For, on, Show, type Component } from "solid-js";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import {
  CANONICAL_COURSES,
  formatCategoryName,
  formatCourseLabel,
  formatDomainName,
  getCategoriesForCourse,
  getCategoryForDomain,
  getDomainsForCourseAndCategory,
} from "../../lib/curriculum";
import { useI18n } from "../../lib/i18n";
import { questionBankService, type CurriculumCatalog } from "../../services/question-bank";
import { resourceService, type CreateResourceInput } from "../../services/resources";
import type { Resource, ResourceTargetLevel, ResourceType, PublishableStatus } from "../../services/schema";

interface ResourceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  resource?: Resource | null | undefined;
  catalog?: CurriculumCatalog | null | undefined;
}

const relationId = (relation: unknown): string => {
  if (!relation) return "";
  if (typeof relation === "string") return relation;
  if (typeof relation === "object" && relation !== null && "id" in relation) {
    return String((relation as { id: unknown }).id);
  }
  return String(relation);
};

export const ResourceFormModal: Component<ResourceFormModalProps> = (props) => {
  const { t, locale } = useI18n();

  const [internalCatalog] = createResource(() => {
    if (props.catalog) return Promise.resolve(props.catalog);
    return questionBankService.getCatalog();
  });
  const catalog = () => props.catalog || internalCatalog();

  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [courseId, setCourseId] = createSignal("grade-6");
  const [categoryId, setCategoryId] = createSignal("");
  const [domainId, setDomainId] = createSignal("");
  const [resourceType, setResourceType] = createSignal<ResourceType>("document");
  const [targetLevel, setTargetLevel] = createSignal<ResourceTargetLevel>("practice");
  const [status, setStatus] = createSignal<PublishableStatus>("published");
  const [language, setLanguage] = createSignal<string>(locale());
  const [url, setUrl] = createSignal("");
  const [body, setBody] = createSignal("");
  const [isSaving, setIsSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const availableCategories = createMemo(() => {
    const cat = catalog();
    if (!cat) return [];
    return getCategoriesForCourse(courseId(), {
      categories: cat.categories ?? [],
      domains: cat.domains ?? [],
      courseDomains: cat.courseDomains ?? [],
    });
  });

  const availableDomains = createMemo(() => {
    const cat = catalog();
    if (!cat) return [];
    return getDomainsForCourseAndCategory(courseId(), categoryId(), {
      domains: cat.domains ?? [],
      courseDomains: cat.courseDomains ?? [],
    });
  });

  // Only opening the form or switching resources should reset the draft.
  createEffect(on([() => props.isOpen, () => props.resource], () => {
    if (props.isOpen) {
      setError(null);
      const cat = catalog();
      if (props.resource) {
        setTitle(props.resource.title || "");
        setDescription(props.resource.description || "");
        const cId = relationId(props.resource.course_id) || "grade-6";
        const catId = relationId(props.resource.category_id);
        const dId = relationId(props.resource.domain_id) || "";
        setCourseId(cId);
        setDomainId(dId);
        if (catId) {
          setCategoryId(catId);
        } else if (dId && cat) {
          setCategoryId(getCategoryForDomain(dId, cat.domains ?? []) || "");
        } else {
          setCategoryId("");
        }
        setResourceType(props.resource.resource_type || "document");
        setTargetLevel(props.resource.target_level || "practice");
        setStatus(props.resource.status || "published");
        setLanguage(props.resource.language || locale());
        setUrl(props.resource.url || "");
        setBody(props.resource.body || "");
      } else {
        setTitle("");
        setDescription("");
        setCourseId("grade-6");
        const cats = availableCategories();
        const firstCat = cats[0]?.id || "";
        setCategoryId(firstCat);
        const doms = availableDomains();
        setDomainId(doms[0]?.id || "");
        setResourceType("document");
        setTargetLevel("practice");
        setStatus("published");
        setLanguage(locale());
        setUrl("");
        setBody("");
      }
    }
  }));

  const handleCourseChange = (newCourse: string): void => {
    setCourseId(newCourse);
    const cat = catalog();
    if (!cat) return;
    const validCats = getCategoriesForCourse(newCourse, {
      categories: cat.categories ?? [],
      domains: cat.domains ?? [],
      courseDomains: cat.courseDomains ?? [],
    });
    const initialCat = categoryId();
    const hasCat = validCats.some((c) => c.id === initialCat || c.code === initialCat);
    const targetCat = hasCat ? initialCat : (validCats[0]?.id || "");
    setCategoryId(targetCat);
    const validDomains = getDomainsForCourseAndCategory(newCourse, targetCat, {
      domains: cat.domains ?? [],
      courseDomains: cat.courseDomains ?? [],
    });
    if (!validDomains.some((d) => d.id === domainId() || d.code === domainId())) {
      setDomainId(validDomains[0]?.id || "");
    }
  };

  const handleCategoryChange = (newCat: string): void => {
    setCategoryId(newCat);
    const cat = catalog();
    if (!cat) return;
    const validDomains = getDomainsForCourseAndCategory(courseId(), newCat, {
      domains: cat.domains ?? [],
      courseDomains: cat.courseDomains ?? [],
    });
    if (!validDomains.some((d) => d.id === domainId() || d.code === domainId())) {
      setDomainId(validDomains[0]?.id || "");
    }
  };

  // A late catalog response must update curriculum fields without clearing content.
  createEffect(on(catalog, (cat) => {
    if (!props.isOpen || !cat) return;
    if (props.resource) {
      if (!categoryId() && domainId()) {
        setCategoryId(getCategoryForDomain(domainId(), cat.domains ?? []) || "");
      }
    } else {
      handleCourseChange(courseId());
    }
  }));

  const handleSubmit = async (e: Event): Promise<void> => {
    e.preventDefault();
    if (!title().trim()) {
      setError(t("common.error"));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let finalCatId = categoryId();
      if (!finalCatId && domainId()) {
        finalCatId = getCategoryForDomain(domainId(), catalog()?.domains ?? []) || "";
      }

      const input: CreateResourceInput = {
        title: title().trim(),
        description: description().trim() || null,
        course_id: courseId() || null,
        category_id: finalCatId || null,
        domain_id: domainId() || null,
        resource_type: resourceType(),
        target_level: targetLevel(),
        status: status(),
        language: language(),
        url: url().trim() || null,
        body: body().trim() || null,
      };

      if (props.resource?.id) {
        await resourceService.updateResource(props.resource.id, input);
      } else {
        await resourceService.createResource(input);
      }

      props.onSaved();
      props.onClose();
    } catch (err) {
      console.error("Failed to save resource", err);
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={props.resource ? t("resources.form.titleEdit") : t("resources.form.titleNew")}
      maxWidth="2xl"
    >
      <form onSubmit={handleSubmit} class="flex max-h-[75dvh] flex-col overflow-hidden text-left">
        <Show when={error()}>
          <div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error()}
          </div>
        </Show>

        <div class="flex-1 space-y-4 overflow-y-auto px-1 py-1">
          {/* Title */}
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
              {t("resources.form.resourceTitle")} *
            </label>
            <input
              type="text"
              required
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              placeholder={t("resources.form.titlePlaceholder")}
              class="mt-1 w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Description */}
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
              {t("resources.form.description")}
            </label>
            <textarea
              rows={2}
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
                placeholder={t("resources.form.descriptionPlaceholder")}
              class="mt-1 w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Course, Category & Domain selectors */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("resources.form.course")}
              </label>
              <select
                value={courseId()}
                onChange={(e) => handleCourseChange(e.currentTarget.value)}
                class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
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

            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("resources.form.category")}
              </label>
              <select
                value={categoryId()}
                onChange={(e) => handleCategoryChange(e.currentTarget.value)}
                class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
              >
                <option value="">{t("resources.form.selectCategory")}</option>
                <For each={availableCategories()}>
                  {(cat) => (
                    <option value={cat.id}>
                      {formatCategoryName(cat, locale())}
                    </option>
                  )}
                </For>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("resources.form.domain")}
              </label>
              <select
                value={domainId()}
                onChange={(e) => setDomainId(e.currentTarget.value)}
                class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
              >
                <option value="">{t("resources.form.selectDomain")}</option>
                <For each={availableDomains()}>
                  {(domain) => (
                    <option value={domain.id}>
                      {formatDomainName(domain, locale())}
                    </option>
                  )}
                </For>
              </select>
            </div>
          </div>

          {/* Type, Level, Status & Language */}
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("resources.form.resourceType")}
              </label>
              <select
                value={resourceType()}
                onChange={(e) => setResourceType(e.currentTarget.value as ResourceType)}
                class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
              >
                <option value="document">{t("backpack.type.document")}</option>
                <option value="video">{t("backpack.type.video")}</option>
                <option value="exercise">{t("backpack.type.exercise")}</option>
                <option value="link">{t("backpack.type.link")}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("resources.form.targetLevel")}
              </label>
              <select
                value={targetLevel()}
                onChange={(e) => setTargetLevel(e.currentTarget.value as ResourceTargetLevel)}
                class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
              >
                <option value="reinforcement">{t("backpack.level.reinforcement")}</option>
                <option value="practice">{t("backpack.level.practice")}</option>
                <option value="enrichment">{t("backpack.level.enrichment")}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("resources.form.status")}
              </label>
              <select
                value={status()}
                onChange={(e) => setStatus(e.currentTarget.value as PublishableStatus)}
                class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
              >
                <option value="published">{t("resources.form.statusPublished")}</option>
                <option value="draft">{t("resources.form.statusDraft")}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("nav.language")}
              </label>
              <select
                value={language()}
                onChange={(event) => setLanguage(event.currentTarget.value)}
                class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
              >
                <option value="en">{t("language.en")}</option>
                <option value="es">{t("language.es")}</option>
                <option value="it">{t("language.it")}</option>
              </select>
            </div>
          </div>

          {/* URL (for video, simulation or external link) */}
          <Show when={resourceType() === "video" || resourceType() === "link" || resourceType() === "exercise"}>
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("resources.form.url")}
              </label>
              <input
                type="url"
                value={url()}
                onInput={(e) => setUrl(e.currentTarget.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                class="mt-1 w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand font-mono"
              />
            </div>
          </Show>

          {/* Markdown Body */}
          <div>
            <label class="block text-xs font-semibold uppercase tracking-wider text-muted">
              {t("resources.form.body")}
            </label>
            <textarea
              rows={5}
              value={body()}
              onInput={(e) => setBody(e.currentTarget.value)}
              placeholder={t("resources.form.bodyPlaceholder")}
              class="mt-1 w-full rounded-xl border border-line bg-white px-3.5 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand font-mono"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div class="mt-5 flex items-center justify-end gap-3 border-t border-line pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={props.onClose}
            disabled={isSaving()}
          >
            {t("resources.form.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={isSaving()}
          >
            {t("resources.form.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
