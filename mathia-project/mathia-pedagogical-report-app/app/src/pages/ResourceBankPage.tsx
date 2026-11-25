import { createMemo, createResource, createSignal, For, Show, type Component } from "solid-js";
import { PageHeader } from "../components/dashboard/PageHeader";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { ResourceFormModal } from "../components/resources/ResourceFormModal";
import { ResourceImportModal } from "../components/resources/ResourceImportModal";
import { ResourceViewerModal } from "../components/resources/ResourceViewerModal";
import { AiResourceModal } from "../components/resources/AiResourceModal";
import {
  CANONICAL_COURSES,
  formatCategoryName,
  formatCourseLabel,
  formatDomainName,
  getCategoriesForCourse,
  getDomainsForCourseAndCategory,
} from "../lib/curriculum";
import { useI18n } from "../lib/i18n";
import { questionBankService } from "../services/question-bank";
import { resourceService } from "../services/resources";
import type { Resource, ResourceTargetLevel, ResourceType } from "../services/schema";

const relationId = (relation: unknown): string => {
  if (!relation) return "";
  if (typeof relation === "string") return relation;
  if (typeof relation === "object" && relation !== null && "id" in relation) {
    return String((relation as { id: unknown }).id);
  }
  return String(relation);
};

export const ResourceBankPage: Component = () => {
  const { t, locale } = useI18n();

  const [catalog] = createResource(() => questionBankService.getCatalog());
  const [resources, { refetch }] = createResource(() => resourceService.listResources());
  const [gradeFilter, setGradeFilter] = createSignal("");
  const [categoryFilter, setCategoryFilter] = createSignal("");
  const [domainFilter, setDomainFilter] = createSignal("");
  const [typeFilter, setTypeFilter] = createSignal<ResourceType | "all">("all");
  const [levelFilter, setLevelFilter] = createSignal<ResourceTargetLevel | "all">("all");
  const [search, setSearch] = createSignal("");

  const [isFormOpen, setIsFormOpen] = createSignal(false);
  const [isImportOpen, setIsImportOpen] = createSignal(false);
  const [isAiOpen, setIsAiOpen] = createSignal(false);
  const [notification, setNotification] = createSignal<string | null>(null);
  const [editingResource, setEditingResource] = createSignal<Resource | null>(null);
  const [viewingResource, setViewingResource] = createSignal<Resource | null>(null);

  const handleGradeChange = (newGrade: string): void => {
    setGradeFilter(newGrade);
    const cat = catalog();
    if (cat) {
      if (categoryFilter()) {
        const validCats = getCategoriesForCourse(newGrade, {
          categories: cat.categories ?? [],
          domains: cat.domains ?? [],
          courseDomains: cat.courseDomains ?? [],
        });
        if (!validCats.some((c) => c.id === categoryFilter() || c.code === categoryFilter())) {
          setCategoryFilter("");
        }
      }
      if (domainFilter()) {
        const validDomains = getDomainsForCourseAndCategory(newGrade, categoryFilter(), {
          domains: cat.domains ?? [],
          courseDomains: cat.courseDomains ?? [],
        });
        if (!validDomains.some((d) => d.id === domainFilter() || d.code === domainFilter())) {
          setDomainFilter("");
        }
      }
    }
  };

  const handleCategoryChange = (newCat: string): void => {
    setCategoryFilter(newCat);
    const cat = catalog();
    if (cat && domainFilter()) {
      const validDomains = getDomainsForCourseAndCategory(gradeFilter(), newCat, {
        domains: cat.domains ?? [],
        courseDomains: cat.courseDomains ?? [],
      });
      if (!validDomains.some((d) => d.id === domainFilter() || d.code === domainFilter())) {
        setDomainFilter("");
      }
    }
  };

  const availableCategories = createMemo(() => {
    const cat = catalog();
    if (!cat) return [];
    return getCategoriesForCourse(gradeFilter(), {
      categories: cat.categories ?? [],
      domains: cat.domains ?? [],
      courseDomains: cat.courseDomains ?? [],
    });
  });

  const availableDomains = createMemo(() => {
    const cat = catalog();
    if (!cat) return [];
    return getDomainsForCourseAndCategory(gradeFilter(), categoryFilter(), {
      domains: cat.domains ?? [],
      courseDomains: cat.courseDomains ?? [],
    });
  });

  const filteredResources = createMemo(() => {
    const list = resources() || [];
    return list.filter((res) => {
      const staticQuery = search().trim().toLowerCase();
      const staticGrade = gradeFilter();
      const staticCategory = categoryFilter();
      const staticDomain = domainFilter();
      const staticType = typeFilter();
      const staticLevel = levelFilter();

      const cId = relationId(res.course_id);
      const catId = relationId(res.category_id);
      const dId = relationId(res.domain_id);
      if (staticGrade && cId && cId !== staticGrade) return false;
      if (staticCategory && catId && catId !== staticCategory) return false;
      if (staticDomain && dId && dId !== staticDomain) return false;
      if (staticType !== "all" && res.resource_type !== staticType) return false;
      if (staticLevel !== "all" && res.target_level !== staticLevel) return false;
      if (staticQuery) {
        const matchesTitle = res.title.toLowerCase().includes(staticQuery);
        const matchesDesc = res.description?.toLowerCase().includes(staticQuery);
        if (!matchesTitle && !matchesDesc) return false;
      }
      return true;
    });
  });

  const handleOpenNew = (): void => {
    setEditingResource(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (res: Resource): void => {
    setEditingResource(res);
    setIsFormOpen(true);
  };

  const handleOpenView = (res: Resource): void => {
    setViewingResource(res);
  };

  return (
    <div class="space-y-6">
      <PageHeader
        eyebrow={t("nav.resources")}
        title={t("resources.page.title")}
        description={t("resources.page.description")}
      />

      <Show when={notification()}>
        <div class="flex items-center justify-between rounded-xl bg-success-soft p-4 text-sm font-semibold text-success">
          <span>{notification()}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            class="ml-4 text-xs font-bold text-success hover:opacity-75"
          >
            ✕
          </button>
        </div>
      </Show>

      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold uppercase tracking-wider text-muted">
          {filteredResources().length} {t("resources.page.title")}
        </span>
        <div class="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setIsImportOpen(true)} class="gap-2">
            <Icon name="upload" class="size-4" />
            {t("resources.import.action")}
          </Button>
          <Button variant="secondary" onClick={() => setIsAiOpen(true)} class="gap-2">
            <Icon name="refresh" class="size-4" />
            {t("resources.aiGenerate.button")}
          </Button>
          <Button onClick={handleOpenNew} class="gap-2">
            <Icon name="plus" class="size-4" />
            {t("resources.button.new")}
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div class="rounded-2xl border border-line bg-surface p-4 shadow-sm">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {/* Grade / Course Filter */}
          <div>
            <label class="block text-xs font-semibold text-muted mb-1">
              {t("resources.filter.grade")}
            </label>
            <select
              value={gradeFilter()}
              onChange={(e) => handleGradeChange(e.currentTarget.value)}
              class="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs sm:text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">{t("resources.filter.allGrades")}</option>
              <For each={CANONICAL_COURSES}>
                {(c) => (
                  <option value={c.id}>
                    {formatCourseLabel(c.id, locale())}
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label class="block text-xs font-semibold text-muted mb-1">
              {t("questions.category")}
            </label>
            <select
              value={categoryFilter()}
              onChange={(e) => handleCategoryChange(e.currentTarget.value)}
              class="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs sm:text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">{t("questions.allCategories")}</option>
              <For each={availableCategories()}>
                {(cat) => (
                  <option value={cat.id}>
                    {formatCategoryName(cat, locale())}
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Domain Filter */}
          <div>
            <label class="block text-xs font-semibold text-muted mb-1">
              {t("resources.filter.domain")}
            </label>
            <select
              value={domainFilter()}
              onChange={(e) => setDomainFilter(e.currentTarget.value)}
              class="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs sm:text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">{t("resources.filter.allDomains")}</option>
              <For each={availableDomains()}>
                {(domain) => (
                  <option value={domain.id}>
                    {formatDomainName(domain, locale())}
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Target Level */}
          <div>
            <label class="block text-xs font-semibold text-muted mb-1">
              {t("resources.filter.targetLevel")}
            </label>
            <select
              value={levelFilter()}
              onChange={(e) => setLevelFilter(e.currentTarget.value as any)}
              class="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs sm:text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="all">{t("resources.filter.allLevels")}</option>
              <option value="reinforcement">{t("backpack.level.reinforcement")}</option>
              <option value="practice">{t("backpack.level.practice")}</option>
              <option value="enrichment">{t("backpack.level.enrichment")}</option>
            </select>
          </div>

          {/* Resource Type */}
          <div>
            <label class="block text-xs font-semibold text-muted mb-1">
              {t("resources.filter.type")}
            </label>
            <select
              value={typeFilter()}
              onChange={(e) => setTypeFilter(e.currentTarget.value as any)}
              class="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs sm:text-sm font-medium text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="all">{t("resources.filter.allTypes")}</option>
              <option value="document">{t("backpack.type.document")}</option>
              <option value="video">{t("backpack.type.video")}</option>
              <option value="exercise">{t("backpack.type.exercise")}</option>
              <option value="link">{t("backpack.type.link")}</option>
            </select>
          </div>

          {/* Search */}
          <div>
            <label class="block text-xs font-semibold text-muted mb-1">
              {t("common.search")}
            </label>
            <div class="relative">
              <input
                type="text"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                placeholder={t("resources.search.placeholder")}
                class="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs sm:text-sm text-ink outline-none transition focus:border-brand focus:ring-1 focus:ring-brand pr-8"
              />
              <Show when={search()}>
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink text-xs"
                >
                  ✕
                </button>
              </Show>
            </div>
          </div>
        </div>
      </div>

      {/* Resources Cards Grid */}
      <Show
        when={!resources.loading}
        fallback={
          <div class="py-12 text-center text-sm text-muted">
            {t("common.loading")}
          </div>
        }
      >
        <Show
          when={filteredResources().length > 0}
          fallback={
            <div class="rounded-2xl border border-dashed border-line bg-surface p-12 text-center">
              <p class="font-semibold text-ink">{t("resources.empty.title")}</p>
              <p class="mt-1 text-sm text-muted">{t("resources.empty.description")}</p>
            </div>
          }
        >
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={filteredResources()}>
              {(res) => (
                <div class="flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-xs transition hover:border-brand/40 hover:shadow-md">
                  <div>
                    {/* Top tags */}
                    <div class="flex flex-wrap items-center gap-1.5 mb-3">
                      <Show when={res.course_id}>
                        <span class="inline-flex items-center rounded-lg bg-surface-alt px-2 py-0.5 text-xs font-semibold text-muted">
                          {formatCourseLabel(relationId(res.course_id), locale())}
                        </span>
                      </Show>

                      <Show when={res.domain_id}>
                        <span class="inline-flex items-center rounded-lg bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand">
                          {formatDomainName(relationId(res.domain_id), locale())}
                        </span>
                      </Show>

                      <span
                        class={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold ${
                          res.target_level === "reinforcement"
                            ? "bg-amber-100 text-amber-800"
                            : res.target_level === "enrichment"
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {t(`backpack.level.${res.target_level}` as any)}
                      </span>

                      <Show when={res.status === "draft"}>
                        <span class="inline-flex items-center rounded-lg bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                          {t("resources.form.statusDraft")}
                        </span>
                      </Show>
                    </div>

                    {/* Title */}
                    <h3 class="font-bold text-ink text-base leading-snug">
                      {res.title}
                    </h3>

                    {/* Description */}
                    <Show when={res.description}>
                      <p class="mt-2 line-clamp-3 text-xs text-muted leading-relaxed">
                        {res.description}
                      </p>
                    </Show>
                  </div>

                  {/* Actions */}
                  <div class="mt-4 flex items-center justify-between border-t border-line/60 pt-3">
                    <span class="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                      <Icon name="book" class="size-3.5" />
                      {t(`backpack.type.${res.resource_type}` as any)}
                    </span>

                    <div class="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        class="min-h-8 px-2.5 py-1 text-xs"
                        onClick={() => handleOpenView(res)}
                      >
                        {t("resources.card.view")}
                      </Button>
                      <Button
                        variant="secondary"
                        class="min-h-8 px-2.5 py-1 text-xs"
                        onClick={() => handleOpenEdit(res)}
                      >
                        {t("resources.card.edit")}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* Modal Form */}
      <ResourceFormModal
        isOpen={isFormOpen()}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => refetch()}
        resource={editingResource()}
        catalog={catalog()}
      />

      {/* Viewer Modal */}
      <ResourceViewerModal
        isOpen={Boolean(viewingResource())}
        onClose={() => setViewingResource(null)}
        resource={viewingResource()}
      />

      {/* Import Modal */}
      <ResourceImportModal
        isOpen={isImportOpen()}
        onClose={() => setIsImportOpen(false)}
        onSuccess={(count) => {
          setNotification(t("resources.import.success", { count }));
          setTimeout(() => setNotification(null), 5000);
          void refetch();
        }}
        catalog={catalog()}
      />

      {/* AI Resource Generation Modal */}
      <AiResourceModal
        isOpen={isAiOpen()}
        onClose={() => setIsAiOpen(false)}
        onSuccess={() => {
          setNotification(t("resources.aiGenerate.savedSuccess"));
          setTimeout(() => setNotification(null), 5000);
          void refetch();
        }}
        catalog={catalog() ?? null}
      />
    </div>
  );
};
