import { createMemo, createResource, createSignal, For, Show, type Component } from "solid-js";
import { PageHeader } from "../components/dashboard/PageHeader";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { ResourceViewerModal } from "../components/resources/ResourceViewerModal";
import { formatDomainName } from "../lib/curriculum";
import { useI18n } from "../lib/i18n";
import { studentService, type MasteryLevel, type EvidenceStatus } from "../services/student";
import type { Resource, ResourceTargetLevel, ResourceType } from "../services/schema";

export const StudentBackpackPage: Component = () => {
  const { t, locale } = useI18n();

  const [backpackData] = createResource(() =>
    studentService.getBackpackData(locale()),
  );

  const [selectedDomainFilter, setSelectedDomainFilter] = createSignal("");
  const [selectedTypeFilter, setSelectedTypeFilter] = createSignal<ResourceType | "all">("all");
  const [selectedLevelFilter, setSelectedLevelFilter] = createSignal<ResourceTargetLevel | "all">("all");
  const [search, setSearch] = createSignal("");
  const [viewingResource, setViewingResource] = createSignal<Resource | null>(null);

  const profile = createMemo(() => backpackData()?.profile);

  const filteredCourseResources = createMemo(() => {
    const data = backpackData();
    if (!data) return [];

    return data.allCourseResources.filter((res) => {
      const initialDomain = selectedDomainFilter();
      const initialType = selectedTypeFilter();
      const initialLevel = selectedLevelFilter();
      const initialQ = search().trim().toLowerCase();

      if (initialDomain && res.domain_id && res.domain_id !== initialDomain) return false;
      if (initialType !== "all" && res.resource_type !== initialType) return false;
      if (initialLevel !== "all" && res.target_level !== initialLevel) return false;
      if (initialQ) {
        const matchesTitle = res.title.toLowerCase().includes(initialQ);
        const matchesDesc = res.description?.toLowerCase().includes(initialQ);
        if (!matchesTitle && !matchesDesc) return false;
      }
      return true;
    });
  });

  const getMasteryBadgeClass = (level: MasteryLevel): string => {
    switch (level) {
      case "mastered":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "proficient":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "in_progress":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "needs_reinforcement":
        return "bg-rose-100 text-rose-800 border-rose-200";
      case "unassessed":
      default:
        return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const getEvidenceBadgeClass = (status: EvidenceStatus): string => {
    switch (status) {
      case "sufficient":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "limited":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "unassessed":
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const getScoreBarColor = (score: number | null): string => {
    if (score === null) return "bg-slate-200";
    if (score >= 12.0) return "bg-emerald-500";
    if (score >= 9.0) return "bg-blue-500";
    if (score >= 6.0) return "bg-amber-500";
    return "bg-rose-500";
  };

  const [expandedDomains, setExpandedDomains] = createSignal<Record<string, boolean>>({});
  const toggleDomain = (domainId: string) => {
    setExpandedDomains((prev) => ({ ...prev, [domainId]: !prev[domainId] }));
  };

  const [expandedStandards, setExpandedStandards] = createSignal<Record<string, boolean>>({});
  const toggleStandard = (standardId: string) => {
    setExpandedStandards((prev) => ({ ...prev, [standardId]: !prev[standardId] }));
  };

  return (
    <div class="space-y-8 pb-10">
      {/* Header */}
      <PageHeader
        eyebrow={t("nav.backpack")}
        title={t("backpack.title")}
        description={t("backpack.description")}
      />

      <Show when={profile()}>
        {(p) => (
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-3 shadow-xs">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("resources.filter.grade")}:
              </span>
              <span class="font-bold text-ink text-sm">
                {p().courseLabel}
              </span>
            </div>
            <div class="inline-flex items-center gap-2 rounded-xl bg-brand/10 px-3.5 py-1.5 text-sm font-bold text-brand">
              <Icon name="backpack" class="size-4" />
              <span>{t("backpack.profile.averageScore")}: {p().overallAverageScore} / 15</span>
            </div>
          </div>
        )}
      </Show>

      <Show
        when={!backpackData.loading && backpackData()}
        fallback={
          <div class="py-16 text-center text-sm text-muted">
            {t("common.loading")}
          </div>
        }
      >
        {/* SECTION 1: PERFIL PEDAGÓGICO DEL ALUMNO (Competencias por Dominios) */}
        <section class="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-7">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line/60 pb-4">
            <div>
              <h2 class="text-lg font-bold text-ink">
                {t("backpack.profile.title")}
              </h2>
              <p class="text-xs text-muted mt-0.5">
                {t("backpack.profile.baselineNotice")}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span class="rounded-lg bg-surface-alt px-2.5 py-1 text-xs font-medium text-muted">
                {profile()?.evaluatedDomainsCount ?? 0} {t("backpack.profile.evaluatedDomains")}
              </span>
              <span class="rounded-lg bg-surface-alt px-2.5 py-1 text-xs font-medium text-muted">
                {profile()?.baselineDomainsCount ?? 0} {t("backpack.profile.baselineDomains")}
              </span>
            </div>
          </div>

          {/* Domain Competency Cards */}
          <div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <For each={profile()?.domains}>
              {(d) => (
                <div class="flex flex-col justify-between rounded-2xl border border-line bg-white p-4.5 shadow-xs transition hover:border-brand/40">
                  <div>
                    <div class="flex items-start justify-between gap-2">
                      <h3 class="text-sm font-bold text-ink leading-snug">
                        {d.domainName}
                      </h3>
                      <span
                        class={`inline-flex shrink-0 items-center rounded-lg border px-2 py-0.5 text-xs font-bold ${getMasteryBadgeClass(
                          d.masteryLevel,
                        )}`}
                      >
                        {d.score !== null ? `${d.score.toFixed(1)}` : t("backpack.profile.unassessed")}
                      </span>
                    </div>

                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        class={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${getEvidenceBadgeClass(
                          d.evidenceStatus,
                        )}`}
                      >
                        {t(`backpack.evidence.${d.evidenceStatus}` as any)}
                      </span>
                      <Show when={d.score !== null}>
                        <span class="text-xs font-semibold text-muted">
                          {t(`backpack.mastery.${d.masteryLevel}` as any)}
                        </span>
                      </Show>
                    </div>

                    <div class="mt-2.5 flex items-center gap-2">
                      <div class="h-2 w-full overflow-hidden rounded-full bg-canvas">
                        <div
                          class={`h-full rounded-full transition-all duration-500 ${getScoreBarColor(
                            d.score,
                          )}`}
                          style={{ width: `${d.score !== null ? Math.min(100, Math.max(0, (d.score / 15) * 100)) : 0}%` }}
                        />
                      </div>
                      <span class="text-xs font-semibold text-muted whitespace-nowrap">
                        {d.score !== null ? `${d.score.toFixed(1)}/15` : "—/15"}
                      </span>
                    </div>

                    <div class="mt-3.5 flex items-center justify-between border-t border-line/60 pt-2.5 text-xs text-muted">
                      <span>
                        {d.evaluationsCount > 0
                          ? t("backpack.evaluationsWithCorrect", { count: d.evaluationsCount, correct: d.correctCount, total: d.totalQuestionsCount })
                          : t("backpack.profile.unassessed")}
                      </span>

                      <Show when={d.standards.length > 0}>
                        <button
                          type="button"
                          class="font-semibold text-brand hover:underline"
                          onClick={() => toggleDomain(d.domainId)}
                        >
                          {expandedDomains()[d.domainId]
                            ? t("backpack.hierarchy.hideStandards")
                            : t("backpack.hierarchy.toggleStandards", { count: String(d.standards.length) })}
                        </button>
                      </Show>
                    </div>

                    {/* Collapsible Standards Tree */}
                    <Show when={expandedDomains()[d.domainId] && d.standards.length > 0}>
                      <div class="mt-3 space-y-2 border-t border-line/70 pt-3">
                        <For each={d.standards}>
                          {(std) => (
                            <div class="rounded-xl border border-line/80 bg-canvas/50 p-2.5 text-xs">
                              <div class="flex items-start justify-between gap-1.5">
                                <div class="min-w-0 flex-1">
                                  <span class="font-mono font-bold text-ink">{std.code}</span>
                                  <p class="text-muted text-[11px] mt-0.5 line-clamp-2">{std.description}</p>
                                </div>
                                <div class="flex shrink-0 flex-col items-end gap-1">
                                  <span
                                    class={`rounded px-1.5 py-0.5 font-bold ${getMasteryBadgeClass(
                                      std.masteryLevel,
                                    )}`}
                                  >
                                    {std.score !== null ? `${std.score.toFixed(1)}/15` : "—"}
                                  </span>
                                  <span
                                    class={`rounded px-1 py-0.2 text-[10px] font-medium border ${getEvidenceBadgeClass(
                                      std.evidenceStatus,
                                    )}`}
                                  >
                                    {t(`backpack.evidence.${std.evidenceStatus}` as any)}
                                  </span>
                                </div>
                              </div>

                              <div class="mt-2 flex items-center justify-between text-[11px] text-muted">
                                <span>
                                  {std.evaluationsCount > 0
                                    ? t("backpack.evaluationsSummary", { count: std.evaluationsCount, correct: std.correctCount, total: std.totalQuestionsCount })
                                    : t("backpack.profile.unassessed")}
                                </span>
                                <Show when={std.substandards.length > 0}>
                                  <button
                                    type="button"
                                    class="font-semibold text-brand hover:underline"
                                    onClick={() => toggleStandard(std.standardId)}
                                  >
                                    {expandedStandards()[std.standardId] ? "▲" : "▼"}{" "}
                                    {std.substandards.length} {t("backpack.hierarchy.substandards").toLowerCase()}
                                  </button>
                                </Show>
                              </div>

                              {/* Nested Substandards */}
                              <Show when={expandedStandards()[std.standardId] && std.substandards.length > 0}>
                                <div class="mt-2 space-y-1.5 border-t border-line/60 pt-2 pl-2 border-l-2 border-l-brand/30">
                                  <For each={std.substandards}>
                                    {(sub) => (
                                      <div class="flex items-start justify-between gap-1 bg-white p-1.5 rounded-lg border border-line/50">
                                        <div class="min-w-0 flex-1">
                                          <span class="font-mono font-bold text-[11px] text-ink">{sub.code}</span>
                                          <p class="text-[10px] text-muted line-clamp-1">{sub.description}</p>
                                        </div>
                                        <div class="flex shrink-0 items-center gap-1">
                                          <span class="font-bold text-[11px]">
                                            {sub.score !== null ? `${sub.score.toFixed(1)}/15` : "—"}
                                          </span>
                                          <span
                                            class={`rounded px-1 py-0.2 text-[9px] border ${getEvidenceBadgeClass(
                                              sub.evidenceStatus,
                                            )}`}
                                          >
                                            {t(`backpack.evidence.${sub.evidenceStatus}` as any)}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </section>

        {/* SECTION 2: RECURSOS RECOMENDADOS PARA TU REFUERZO */}
        <section class="rounded-3xl border border-amber-200/80 bg-linear-to-b from-amber-50/50 to-white p-6 shadow-sm sm:p-7">
          <div class="flex items-center gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-xs">
              <Icon name="backpack" class="size-5" />
            </div>
            <div>
              <h2 class="text-lg font-bold text-ink">
                {t("backpack.priority.title")}
              </h2>
              <p class="text-xs text-muted mt-0.5">
                {t("backpack.priority.description")}
              </p>
            </div>
          </div>

          <div class="mt-5">
            <Show
              when={(backpackData()?.priorityResources.length ?? 0) > 0}
              fallback={
                <div class="rounded-2xl border border-dashed border-amber-200 bg-amber-50/30 p-6 text-center text-sm text-muted">
                  {t("backpack.priority.empty")}
                </div>
              }
            >
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <For each={backpackData()?.priorityResources}>
                  {(rec) => (
                    <div class="flex flex-col justify-between rounded-2xl border border-amber-200/80 bg-white p-5 shadow-xs transition hover:border-amber-400 hover:shadow-md">
                      <div>
                        <div class="flex flex-wrap items-center gap-1.5 mb-2.5">
                          <span class="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 border border-amber-300">
                            🎯 {t(`backpack.reason.${rec.reasonKey}`, { code: rec.matchedCode })}
                          </span>
                          <Show when={rec.matchedCode}>
                            <span class="inline-flex items-center rounded-lg bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                              {rec.matchedCode}
                            </span>
                          </Show>
                        </div>

                        <h3 class="font-bold text-ink text-sm sm:text-base leading-snug">
                          {rec.resource.title}
                        </h3>

                        <Show when={rec.resource.description}>
                          <p class="mt-2 line-clamp-2 text-xs text-muted leading-relaxed">
                            {rec.resource.description}
                          </p>
                        </Show>
                      </div>

                      <div class="mt-4 flex items-center justify-between border-t border-line/60 pt-3">
                        <span class="text-xs font-medium text-muted capitalize">
                          {t(`backpack.type.${rec.resource.resource_type}` as any)}
                        </span>
                        <Button
                          class="min-h-8 px-3 py-1 text-xs"
                          onClick={() => setViewingResource(rec.resource)}
                        >
                          {t("backpack.resource.viewDocument")}
                        </Button>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </section>

        {/* SECTION 3: EXPLORADOR DE TODOS LOS RECURSOS DEL CURSO */}
        <section class="rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-7 space-y-5">
          <div>
            <h2 class="text-lg font-bold text-ink">
              {t("backpack.courseResources.title")}
            </h2>
            <p class="text-xs text-muted mt-0.5">
              {t("backpack.courseResources.description")}
            </p>
          </div>

          {/* Filters Bar */}
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 rounded-2xl border border-line bg-canvas p-3.5">
            {/* Domain Filter */}
            <div>
              <label class="block text-xs font-semibold text-muted mb-1">
                {t("resources.filter.domain")}
              </label>
              <select
                value={selectedDomainFilter()}
                onChange={(e) => setSelectedDomainFilter(e.currentTarget.value)}
                class="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink outline-none transition focus:border-brand"
              >
                <option value="">{t("backpack.filter.allDomains")}</option>
                <For each={profile()?.domains}>
                  {(d) => <option value={d.domainId}>{d.domainName}</option>}
                </For>
              </select>
            </div>

            {/* Target Level */}
            <div>
              <label class="block text-xs font-semibold text-muted mb-1">
                {t("resources.filter.targetLevel")}
              </label>
              <select
                value={selectedLevelFilter()}
                onChange={(e) => setSelectedLevelFilter(e.currentTarget.value as any)}
                class="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink outline-none transition focus:border-brand"
              >
                <option value="all">{t("backpack.filter.allLevels")}</option>
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
                value={selectedTypeFilter()}
                onChange={(e) => setSelectedTypeFilter(e.currentTarget.value as any)}
                class="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink outline-none transition focus:border-brand"
              >
                <option value="all">{t("backpack.filter.allTypes")}</option>
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
              <input
                type="text"
                value={search()}
                onInput={(e) => setSearch(e.currentTarget.value)}
                placeholder={t("resources.search.placeholder")}
                class="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink outline-none transition focus:border-brand"
              />
            </div>
          </div>

          {/* Course Resources Cards */}
          <Show
            when={filteredCourseResources().length > 0}
            fallback={
              <div class="rounded-2xl border border-dashed border-line p-10 text-center">
                <p class="font-semibold text-ink">{t("resources.empty.title")}</p>
                <p class="mt-1 text-xs text-muted">{t("resources.empty.description")}</p>
              </div>
            }
          >
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <For each={filteredCourseResources()}>
                {(res) => (
                  <div class="flex flex-col justify-between rounded-2xl border border-line bg-white p-5 shadow-xs transition hover:border-brand/40 hover:shadow-md">
                    <div>
                      <div class="flex flex-wrap items-center gap-1.5 mb-2.5">
                        <Show when={res.domain_id}>
                          <span class="inline-flex items-center rounded-lg bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                            {formatDomainName(res.domain_id, locale())}
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
                      </div>

                      <h3 class="font-bold text-ink text-sm sm:text-base leading-snug">
                        {res.title}
                      </h3>

                      <Show when={res.description}>
                        <p class="mt-2 line-clamp-3 text-xs text-muted leading-relaxed">
                          {res.description}
                        </p>
                      </Show>
                    </div>

                    <div class="mt-4 flex items-center justify-between border-t border-line/60 pt-3">
                      <span class="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                        <Icon name="book" class="size-3.5" />
                        {t(`backpack.type.${res.resource_type}` as any)}
                      </span>

                      <Button
                        variant="secondary"
                        class="min-h-8 px-3 py-1 text-xs"
                        onClick={() => setViewingResource(res)}
                      >
                        {t("backpack.resource.viewDocument")}
                      </Button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </section>
      </Show>

      {/* Viewer Modal */}
      <ResourceViewerModal
        isOpen={Boolean(viewingResource())}
        onClose={() => setViewingResource(null)}
        resource={viewingResource()}
      />
    </div>
  );
};
