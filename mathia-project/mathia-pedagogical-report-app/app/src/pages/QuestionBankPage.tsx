import { createMemo, createResource, createSignal, For, Show, type Component } from "solid-js";

import { PageHeader } from "../components/dashboard/PageHeader";
import { QuestionForm } from "../components/questions/QuestionForm";
import { QuestionImportModal } from "../components/questions/QuestionImportModal";
import { AiQuestionModal } from "../components/questions/AiQuestionModal";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import {
  CANONICAL_COURSES,
  formatCategoryName,
  formatCourseLabel,
  formatDomainName,
  getCategoriesForCourse,
  getCoursesForDomain,
  getDomainsForCourseAndCategory,
  questionMatchesCourse,
  relationId,
} from "../lib/curriculum";
import { useI18n } from "../lib/i18n";
import { questionBankService } from "../services/question-bank";
import type { QuestionBankItem } from "../services/schema";
import { useAuth } from "../stores/auth";

export const QuestionBankPage: Component = () => {
  const { locale, t } = useI18n();
  const auth = useAuth();
  const [catalog] = createResource(() => questionBankService.getCatalog());
  const [questions, { refetch }] = createResource(() => questionBankService.getQuestions());
  const [search, setSearch] = createSignal("");
  const [gradeFilter, setGradeFilter] = createSignal("");
  const [categoryFilter, setCategoryFilter] = createSignal("");
  const [domainFilter, setDomainFilter] = createSignal("");
  const [statusFilter, setStatusFilter] = createSignal("");
  const [isFormOpen, setIsFormOpen] = createSignal(false);
  const [selectedQuestion, setSelectedQuestion] = createSignal<QuestionBankItem | null>(null);
  const [isImportOpen, setIsImportOpen] = createSignal(false);
  const [isAiModalOpen, setIsAiModalOpen] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [actionError, setActionError] = createSignal<string | null>(null);

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

  const visibleQuestions = createMemo(() => {
    const staticQuery = search().trim().toLocaleLowerCase();
    const staticGrade = gradeFilter();
    const staticCat = categoryFilter();
    const staticDomain = domainFilter();
    const staticStatus = statusFilter();
    const cat = catalog();
    const courseDomains = cat?.courseDomains ?? [];
    const domains = cat?.domains ?? [];

    return (questions() ?? []).filter((question) => {
      const matchesSearch =
        !staticQuery ||
        question.prompt.toLocaleLowerCase().includes(staticQuery) ||
        question.external_id?.toLocaleLowerCase().includes(staticQuery);
      const matchesGrade = !staticGrade || questionMatchesCourse(question, staticGrade, courseDomains);
      const dId = relationId(question.domain_id);
      const matchesDomain = !staticDomain || dId === staticDomain;
      let matchesCat = true;
      if (staticCat) {
        const domainObj = domains.find((d) => d.id === dId || d.code === dId);
        matchesCat =
          relationId(domainObj?.category_id) === staticCat || (domainObj?.code ?? "").startsWith(staticCat);
      }
      const matchesStatus = !staticStatus || question.status === staticStatus;
      return Boolean(matchesSearch && matchesGrade && matchesCat && matchesDomain && matchesStatus);
    });
  });

  const canCreate = createMemo(() =>
    auth.user?.role === "teacher" || auth.user?.role === "director",
  );

  const handleOpenNew = (): void => {
    setSelectedQuestion(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (question: QuestionBankItem): void => {
    setSelectedQuestion(question);
    setIsFormOpen(true);
  };

  const handlePublish = async (question: QuestionBankItem): Promise<void> => {
    setActionError(null);
    try {
      await questionBankService.publishQuestion(question.id);
      setNotice(t("questions.publishSuccess"));
      void refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  const handleArchive = async (question: QuestionBankItem): Promise<void> => {
    setActionError(null);
    try {
      await questionBankService.archiveQuestion(question.id);
      setNotice(t("questions.archiveSuccess"));
      void refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  const handleDuplicate = async (question: QuestionBankItem): Promise<void> => {
    setActionError(null);
    try {
      await questionBankService.duplicateQuestion(question.id);
      setNotice(t("questions.duplicateSuccess"));
      void refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={t("questions.eyebrow")}
        title={t("questions.title")}
        description={t("questions.description")}
      />

      <div class="mt-7 rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_9rem_11rem_13rem_9rem_auto_auto]">
          <label class="relative sm:col-span-2 lg:col-span-1">
            <span class="sr-only">{t("common.search")}</span>
            <Icon name="search" class="pointer-events-none absolute left-3 top-3.5 size-4 text-ink-faint" />
            <input
              class="min-h-11 w-full rounded-xl border border-line bg-canvas-soft pl-10 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
              value={search()}
              placeholder={t("questions.search")}
              onInput={(event) => setSearch(event.currentTarget.value)}
            />
          </label>
          <select
            aria-label={t("questions.grade")}
            class="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold outline-none focus:border-brand"
            value={gradeFilter()}
            onChange={(event) => handleGradeChange(event.currentTarget.value)}
          >
            <option value="">{t("questions.allGrades")}</option>
            <For each={CANONICAL_COURSES}>
              {(course) => (
                <option value={course.id}>
                  {formatCourseLabel(course.id, locale())}
                </option>
              )}
            </For>
          </select>
          <select
            aria-label={t("questions.category")}
            class="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold outline-none focus:border-brand"
            value={categoryFilter()}
            onChange={(event) => handleCategoryChange(event.currentTarget.value)}
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
          <select
            aria-label={t("questions.domain")}
            class="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold outline-none focus:border-brand"
            value={domainFilter()}
            onChange={(event) => setDomainFilter(event.currentTarget.value)}
          >
            <option value="">{t("questions.allDomains")}</option>
            <For each={availableDomains()}>
              {(domain) => (
                <option value={domain.id}>
                  {formatDomainName(domain, locale())}
                </option>
              )}
            </For>
          </select>
          <select
            aria-label={t("common.status")}
            class="min-h-11 rounded-xl border border-line bg-white px-3 text-sm font-semibold outline-none focus:border-brand"
            value={statusFilter()}
            onChange={(event) => setStatusFilter(event.currentTarget.value)}
          >
            <option value="">{t("questions.status.all")}</option>
            <option value="draft">{t("questions.status.draft")}</option>
            <option value="published">{t("questions.status.published")}</option>
            <option value="archived">{t("questions.status.archived")}</option>
          </select>
          <Button variant="secondary" disabled={!canCreate()} onClick={() => setIsImportOpen(true)}>
            <Icon name="upload" class="size-4" />
            {t("questions.import.action")}
          </Button>
          <Button variant="secondary" disabled={!canCreate()} onClick={() => setIsAiModalOpen(true)}>
            <Icon name="refresh" class="size-4" />
            {t("questions.aiGenerate.button")}
          </Button>
          <Button disabled={!canCreate()} onClick={handleOpenNew}>
            <Icon name="plus" class="size-4" />
            {t("questions.new")}
          </Button>
        </div>
      </div>

      <Show when={notice()}>
        <p class="mt-4 rounded-xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-strong">
          {notice()}
        </p>
      </Show>

      <Show when={actionError()}>
        <p role="alert" class="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          {actionError()}
        </p>
      </Show>

      <Show when={!questions.loading && !catalog.loading && !questions.error && !catalog.error} fallback={
        <p class="mt-6 text-sm font-semibold text-ink-muted">
          {questions.error || catalog.error ? t("common.error") : t("common.loading")}
        </p>
      }>
        <Show
          when={visibleQuestions().length > 0}
          fallback={
            <div class="mt-6 rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
              <p class="font-bold text-ink">{t("questions.empty")}</p>
              <p class="mt-2 text-sm text-ink-muted">{t("questions.emptyHelp")}</p>
            </div>
          }
        >
          <div class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <For each={visibleQuestions()}>
              {(question: QuestionBankItem) => (
                <article class="flex flex-col justify-between rounded-2xl border border-line bg-white p-5 shadow-card">
                  <div>
                    <div class="flex items-start justify-between gap-3">
                      {(() => {
                        const dId = relationId(question.domain_id);
                        const domainObj = catalog()?.domains?.find((d) => d.id === dId);
                        const domainName = formatDomainName(domainObj || dId, locale());
                        const courseIds = getCoursesForDomain(dId, catalog()?.courseDomains ?? []);
                        const techCode = relationId(question.standard_id) || dId;

                        return (
                          <div class="flex flex-wrap items-center gap-1.5" title={techCode}>
                            <For each={courseIds}>
                              {(cId) => (
                                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                                  {formatCourseLabel(cId, locale())}
                                </span>
                              )}
                            </For>
                            <span class="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand-strong">
                              {domainName || techCode}
                            </span>
                          </div>
                        );
                      })()}
                      <span class={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${
                        question.status === "published"
                          ? "bg-emerald-50 text-emerald-700"
                          : question.status === "archived"
                          ? "bg-gray-100 text-gray-500"
                          : "bg-amber-50 text-amber-700"
                      }`}>
                        {t(`questions.status.${question.status}`)}
                      </span>
                    </div>
                    <p class="mt-4 line-clamp-4 text-sm font-semibold leading-6 text-ink">
                      {question.prompt}
                    </p>
                  </div>

                  <div>
                    <div class="mt-5 flex flex-wrap gap-2 border-t border-line pt-4 text-xs font-semibold text-ink-muted">
                      <span>{t(`questions.type.${question.question_type === "single_choice" ? "singleChoice" : question.question_type === "multiple_choice" ? "multipleChoice" : question.question_type === "true_false" ? "trueFalse" : question.question_type === "short_text" ? "shortText" : "numeric"}`)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t(`questions.difficulty.${question.difficulty}`)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{question.language.toUpperCase()}</span>
                    </div>

                    <div class="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line/60 pt-3">
                      <Show when={question.status === "draft"}>
                        <Button
                          variant="ghost"
                          class="!px-2.5 !py-1 !text-xs"
                          onClick={() => handleOpenEdit(question)}
                        >
                          {t("questions.actions.edit")}
                        </Button>
                        <Button
                          variant="secondary"
                          class="!px-2.5 !py-1 !text-xs"
                          onClick={() => void handlePublish(question)}
                        >
                          {t("questions.actions.publish")}
                        </Button>
                      </Show>

                      <Show when={question.status === "published"}>
                        <Button
                          variant="ghost"
                          class="!px-2.5 !py-1 !text-xs"
                          onClick={() => handleOpenEdit(question)}
                        >
                          {t("questions.actions.view")}
                        </Button>
                        <Button
                          variant="secondary"
                          class="!px-2.5 !py-1 !text-xs"
                          onClick={() => void handleDuplicate(question)}
                        >
                          {t("questions.actions.duplicate")}
                        </Button>
                        <Button
                          variant="ghost"
                          class="!px-2.5 !py-1 !text-xs text-danger hover:bg-danger-soft"
                          onClick={() => void handleArchive(question)}
                        >
                          {t("questions.actions.archive")}
                        </Button>
                      </Show>

                      <Show when={question.status === "archived"}>
                        <Button
                          variant="ghost"
                          class="!px-2.5 !py-1 !text-xs"
                          onClick={() => handleOpenEdit(question)}
                        >
                          {t("questions.actions.view")}
                        </Button>
                        <Button
                          variant="secondary"
                          class="!px-2.5 !py-1 !text-xs"
                          onClick={() => void handleDuplicate(question)}
                        >
                          {t("questions.actions.duplicate")}
                        </Button>
                      </Show>
                    </div>
                  </div>
                </article>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <QuestionForm
        isOpen={isFormOpen()}
        catalog={catalog()}
        initialQuestion={selectedQuestion()}
        onClose={() => {
          setIsFormOpen(false);
          setSelectedQuestion(null);
        }}
        onSuccess={() => void refetch()}
      />
      <QuestionImportModal
        isOpen={isImportOpen()}
        catalog={catalog()}
        onClose={() => setIsImportOpen(false)}
        onSuccess={(count) => {
          setNotice(t("questions.import.success", { count }));
          void refetch();
        }}
      />
      <AiQuestionModal
        isOpen={isAiModalOpen()}
        catalog={catalog() ?? null}
        onClose={() => setIsAiModalOpen(false)}
        onSuccess={() => {
          setNotice(t("questions.aiGenerate.savedSuccess"));
          void refetch();
        }}
      />
    </div>
  );
};
