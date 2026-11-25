import { createMemo, createResource, createSignal, For, Show, type Component } from "solid-js";
import { PageHeader } from "../components/dashboard/PageHeader";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { useI18n } from "../lib/i18n";
import { testBuilderService } from "../services/test-builder";
import { TestFormModal } from "../components/tests/TestFormModal";
import { TestBlueprintModal } from "../components/tests/TestBlueprintModal";
import { TestAssignModal } from "../components/tests/TestAssignModal";
import type { TestRecord } from "../services/schema";

type FilterStatus = "active" | "all" | "draft" | "published" | "archived";

export const TestsPage: Component = () => {
  const { t } = useI18n();

  const [tests, { refetch }] = createResource(async () => {
    return (await testBuilderService.getTests()) as TestRecord[];
  });

  const [searchQuery, setSearchQuery] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal<FilterStatus>("active");

  const [isCreateOpen, setIsCreateOpen] = createSignal(false);
  const [testToEdit, setTestToEdit] = createSignal<TestRecord | null>(null);
  const [selectedTestForBlueprint, setSelectedTestForBlueprint] = createSignal<TestRecord | null>(null);
  const [selectedTestForAssign, setSelectedTestForAssign] = createSignal<TestRecord | null>(null);

  const [actionError, setActionError] = createSignal<string | null>(null);
  const [actionSuccess, setActionSuccess] = createSignal<string | null>(null);

  // Counts for filter pills
  const counts = createMemo(() => {
    const list = tests() || [];
    return {
      all: list.length,
      active: list.filter((x) => x.status !== "archived").length,
      draft: list.filter((x) => x.status === "draft").length,
      published: list.filter((x) => x.status === "published").length,
      archived: list.filter((x) => x.status === "archived").length,
    };
  });

  // Filtered list
  const filteredTests = createMemo(() => {
    const list = tests() || [];
    const staticQuery = searchQuery().toLowerCase().trim();
    const staticFilter = statusFilter();

    return list.filter((test) => {
      // Status filtering
      if (staticFilter === "active" && test.status === "archived") return false;
      if (staticFilter === "draft" && test.status !== "draft") return false;
      if (staticFilter === "published" && test.status !== "published") return false;
      if (staticFilter === "archived" && test.status !== "archived") return false;

      // Query filtering
      if (staticQuery) {
        const matchesTitle = test.title.toLowerCase().includes(staticQuery);
        const matchesDesc = test.description ? test.description.toLowerCase().includes(staticQuery) : false;
        if (!matchesTitle && !matchesDesc) return false;
      }

      return true;
    });
  });

  const handleArchive = async (test: TestRecord) => {
    if (!confirm(t("tests.archiveConfirm", { title: test.title }))) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await testBuilderService.archiveTest(test.id);
      setActionSuccess(t("tests.archiveSuccess"));
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  const handleUnarchive = async (test: TestRecord) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await testBuilderService.unarchiveTest(test.id);
      setActionSuccess(t("tests.unarchiveSuccess"));
      refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  return (
    <div>
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          eyebrow={t("app.brandDescriptor")}
          title={t("tests.title")}
          description={t("tests.description")}
        />
        <Button onClick={() => setIsCreateOpen(true)}>
          <Icon name="plus" class="mr-2 size-4" />
          {t("tests.create")}
        </Button>
      </div>

      {/* Action feedback banners */}
      <Show when={actionSuccess()}>
        <div class="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {actionSuccess()}
        </div>
      </Show>

      <Show when={actionError()}>
        <div class="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {actionError()}
        </div>
      </Show>

      {/* Controls: search and status filter tabs */}
      <div class="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div class="relative flex-1 max-w-md">
          <Icon name="search" class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder={t("tests.searchPlaceholder")}
            class="w-full rounded-xl border border-line bg-white pl-9 pr-8 py-2 text-xs text-ink outline-none focus:border-brand"
          />
          <Show when={searchQuery()}>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              class="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              <Icon name="x" class="size-3.5" />
            </button>
          </Show>
        </div>

        {/* Filter pills */}
        <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-canvas p-1">
          <button
            type="button"
            onClick={() => setStatusFilter("active")}
            class={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter() === "active"
                ? "bg-white text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {t("tests.filter.active")} ({counts().active})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            class={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter() === "all"
                ? "bg-white text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {t("tests.filter.all")} ({counts().all})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("draft")}
            class={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter() === "draft"
                ? "bg-white text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {t("tests.filter.draft")} ({counts().draft})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("published")}
            class={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter() === "published"
                ? "bg-white text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {t("tests.filter.published")} ({counts().published})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("archived")}
            class={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter() === "archived"
                ? "bg-white text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {t("tests.filter.archived")} ({counts().archived})
          </button>
        </div>
      </div>

      <div class="mt-6">
        <Show
          when={!tests.loading}
          fallback={
            <div class="flex items-center justify-center p-12 text-sm text-ink-muted">
              {t("app.loading")}
            </div>
          }
        >
          <Show
            when={tests() && tests()!.length > 0}
            fallback={
              <div class="rounded-2xl border border-dashed border-line bg-canvas p-12 text-center">
                <Icon name="book" class="mx-auto size-12 text-ink-muted/50" />
                <h3 class="mt-4 text-base font-bold text-ink">{t("tests.empty")}</h3>
                <p class="mt-1 text-sm text-ink-muted">{t("tests.emptyDescription")}</p>
                <div class="mt-6">
                  <Button onClick={() => setIsCreateOpen(true)}>
                    <Icon name="plus" class="mr-2 size-4" />
                    {t("tests.create")}
                  </Button>
                </div>
              </div>
            }
          >
            <Show
              when={filteredTests().length > 0}
              fallback={
                <div class="rounded-2xl border border-line bg-white p-12 text-center text-sm text-ink-muted">
                  {t("tests.noMatchingResults")}
                </div>
              }
            >
              <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <For each={filteredTests()}>
                  {(test) => {
                    const isArchived = () => test.status === "archived";

                    return (
                      <div
                        class={`flex flex-col justify-between rounded-2xl border p-5 shadow-card transition-all ${
                          isArchived()
                            ? "border-line/70 bg-canvas/50 opacity-80 hover:opacity-100"
                            : "border-line bg-white hover:shadow-md"
                        }`}
                      >
                        <div>
                          <div class="flex items-start justify-between gap-3">
                            <span
                              class={`inline-block rounded-md px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                                test.status === "published"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : test.status === "draft"
                                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-canvas text-ink-muted border border-line"
                              }`}
                            >
                              {t(`tests.status.${test.status}`)}
                            </span>
                            <Show when={test.duration_minutes}>
                              <span class="flex items-center gap-1 font-mono text-xs text-ink-muted">
                                <Icon name="report" class="size-3.5" />
                                {test.duration_minutes}m
                              </span>
                            </Show>
                          </div>

                          <h3 class={`mt-3 text-base font-bold ${isArchived() ? "text-ink-muted line-through" : "text-ink"}`}>
                            {test.title}
                          </h3>
                          <Show when={test.description}>
                            <p class="mt-1 text-xs text-ink-muted line-clamp-2">{test.description}</p>
                          </Show>

                          <div class="mt-4 flex flex-wrap gap-2 text-xs text-ink-muted">
                            <span class="rounded bg-canvas px-2 py-0.5 font-medium">
                              {test.max_score ? `${test.max_score} pts` : "Score uncalculated"}
                            </span>
                            <span class="rounded bg-canvas px-2 py-0.5 font-medium">
                              {test.max_attempts} {t("tests.maxAttempts")}
                            </span>
                          </div>
                        </div>

                        <div class="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                          <div class="flex items-center gap-1.5">
                            <Button
                              variant="secondary"
                              class="!text-xs !py-1.5"
                              onClick={() => setSelectedTestForBlueprint(test)}
                            >
                              <Icon name="book" class="mr-1.5 size-3.5" />
                              {t("tests.rules")}
                            </Button>

                            <Button
                              variant="secondary"
                              class="!text-xs !py-1.5"
                              onClick={() => setTestToEdit(test)}
                              title={t("tests.edit")}
                            >
                              <Icon name="pencil" class="size-3.5" />
                            </Button>

                            <Show
                              when={isArchived()}
                              fallback={
                                <Button
                                  variant="secondary"
                                  class="!text-xs !py-1.5 text-ink-muted hover:text-rose-600 hover:bg-rose-50"
                                  onClick={() => handleArchive(test)}
                                  title={t("tests.archive")}
                                >
                                  <Icon name="archive" class="size-3.5" />
                                </Button>
                              }
                            >
                              <Button
                                variant="secondary"
                                class="!text-xs !py-1.5 text-brand"
                                onClick={() => handleUnarchive(test)}
                                title={t("tests.unarchive")}
                              >
                                <Icon name="check" class="mr-1 size-3.5" />
                                {t("tests.unarchive")}
                              </Button>
                            </Show>
                          </div>

                          <Show when={!isArchived()}>
                            <Button
                              variant={test.status === "published" ? "primary" : "secondary"}
                              class="!text-xs !py-1.5"
                              disabled={test.status !== "published"}
                              onClick={() => setSelectedTestForAssign(test)}
                            >
                              <Icon name="user" class="mr-1.5 size-3.5" />
                              {t("tests.assign")}
                            </Button>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>
        </Show>
      </div>

      {/* Modals */}
      <TestFormModal
        isOpen={isCreateOpen() || Boolean(testToEdit())}
        testToEdit={testToEdit()}
        onClose={() => {
          setIsCreateOpen(false);
          setTestToEdit(null);
        }}
        onSuccess={() => {
          setIsCreateOpen(false);
          setTestToEdit(null);
          refetch();
        }}
      />

      <TestBlueprintModal
        isOpen={Boolean(selectedTestForBlueprint())}
        test={selectedTestForBlueprint()}
        onClose={() => setSelectedTestForBlueprint(null)}
        onPublished={() => {
          refetch();
          setSelectedTestForBlueprint(null);
        }}
      />

      <TestAssignModal
        isOpen={Boolean(selectedTestForAssign())}
        test={selectedTestForAssign()}
        onClose={() => setSelectedTestForAssign(null)}
        onAssigned={() => {
          setSelectedTestForAssign(null);
        }}
      />
    </div>
  );
};
