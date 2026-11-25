import { createMemo, createResource, createSignal, For, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import {
  CANONICAL_COURSES,
  formatCourseLabel,
  formatDomainName,
  getDomainsForCourse,
} from "../../lib/curriculum";
import { useI18n } from "../../lib/i18n";
import {
  countMatchingQuestions,
  testBuilderService,
  type TestBlueprintRuleInput,
} from "../../services/test-builder";
import { questionBankService } from "../../services/question-bank";
import type { QuestionDifficulty, QuestionType, TestBlueprintRule, TestRecord, TestVersion } from "../../services/schema";

interface Props {
  isOpen: boolean;
  test: TestRecord | null;
  onClose: () => void;
  onPublished: () => void;
}

export const TestBlueprintModal: Component<Props> = (props) => {
  const { locale, t } = useI18n();

  const isArchived = () => props.test?.status === "archived";

  const [rules, { refetch: refetchRules }] = createResource(
    () => props.test?.id,
    async (testId) => {
      if (!testId) return [];
      return (await testBuilderService.getRules(testId)) as TestBlueprintRule[];
    },
  );

  const [versions, { refetch: refetchVersions }] = createResource(
    () => props.test?.id,
    async (testId) => {
      if (!testId) return [];
      const vList = (await testBuilderService.getVersions(testId)) as TestVersion[];
      return vList.filter((v) => v.status === "published");
    },
  );

  const latestVersion = createMemo(() => {
    const vList = versions();
    if (!vList || vList.length === 0) return null;
    const sorted = [...vList].sort((a, b) => b.version_number - a.version_number);
    return sorted[0] || null;
  });

  const [catalog] = createResource(async () => {
    return await questionBankService.getCatalog();
  });
  const domains = createMemo(() => catalog()?.domains || []);

  // Fetch published questions from bank to evaluate rule availability in real-time
  const [publishedQuestions] = createResource(async () => {
    return await questionBankService.getQuestions({ status: { _eq: "published" } });
  });

  // Rule form fields
  const [editingRuleId, setEditingRuleId] = createSignal<string | null>(null);
  const [editingRuleIndex, setEditingRuleIndex] = createSignal<number>(1);
  const [sectionTitle, setSectionTitle] = createSignal("");
  const [selectedDomainId, setSelectedDomainId] = createSignal("");
  const [selectedDifficulty, setSelectedDifficulty] = createSignal<QuestionDifficulty | "">("");
  const [selectedType, setSelectedType] = createSignal<QuestionType | "">("");
  const [questionCount, setQuestionCount] = createSignal(3);

  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [deletingRuleId, setDeletingRuleId] = createSignal<string | null>(null);
  const [isCompiling, setIsCompiling] = createSignal(false);
  const [compileErrors, setCompileErrors] = createSignal<string[] | null>(null);
  const [successMessage, setSuccessMessage] = createSignal<string | null>(null);

  // Available count for the current form inputs
  const availableForCurrentFilter = createMemo(() => {
    const questions = publishedQuestions() || [];
    return countMatchingQuestions(questions, {
      language: props.test?.language ?? null,
      domain_id: selectedDomainId() || null,
      difficulty: selectedDifficulty() ? (selectedDifficulty() as QuestionDifficulty) : null,
      question_type: selectedType() ? (selectedType() as QuestionType) : null,
    });
  });

const relationId = (relation: unknown): string => {
  if (!relation) return "";
  if (typeof relation === "string") return relation;
  if (typeof relation === "object" && relation !== null && "id" in relation) {
    return String((relation as { id: unknown }).id);
  }
  return String(relation);
};

  const getRuleAvailability = (r: TestBlueprintRule) => {
    const questions = publishedQuestions() || [];
    const domainId = relationId(r.domain_id);
    return countMatchingQuestions(questions, {
      language: props.test?.language ?? null,
      domain_id: domainId || null,
      difficulty: r.difficulty || null,
      question_type: r.question_type || null,
    });
  };

  // Check if any rule in the table has insufficient questions
  const rulesWithShortage = createMemo(() => {
    const rList = rules() || [];
    const questions = publishedQuestions() || [];
    return rList.filter((r) => {
      const domainId = relationId(r.domain_id);
      const avail = countMatchingQuestions(questions, {
        language: props.test?.language ?? null,
        domain_id: domainId || null,
        difficulty: r.difficulty || null,
        question_type: r.question_type || null,
      });
      return avail < r.question_count;
    });
  });

  const startEditRule = (r: TestBlueprintRule, index: number) => {
    setEditingRuleId(r.id);
    setEditingRuleIndex(index);
    setSectionTitle(r.section_title === "General" ? "" : (r.section_title || ""));
    setSelectedDomainId(relationId(r.domain_id));
    setSelectedDifficulty(r.difficulty || "");
    setSelectedType(r.question_type || "");
    setQuestionCount(r.question_count);
    setCompileErrors(null);
    setSuccessMessage(null);
  };

  const cancelEditRule = () => {
    setEditingRuleId(null);
    setSectionTitle("");
    setSelectedDomainId("");
    setSelectedDifficulty("");
    setSelectedType("");
    setQuestionCount(3);
  };

  const handleSaveRule = async () => {
    if (!props.test || isArchived()) return;
    setIsSubmitting(true);
    setCompileErrors(null);
    setSuccessMessage(null);

    try {
      const ruleData: Partial<TestBlueprintRuleInput> = {
        section_title: sectionTitle().trim() || null,
        domain_id: selectedDomainId() || null,
        difficulty: selectedDifficulty() ? (selectedDifficulty() as QuestionDifficulty) : null,
        question_type: selectedType() ? (selectedType() as QuestionType) : null,
        question_count: Math.max(1, Number(questionCount()) || 1),
      };

      if (editingRuleId()) {
        await testBuilderService.updateRule(editingRuleId()!, ruleData);
        setSuccessMessage(t("tests.form.updateSuccess"));
      } else {
        await testBuilderService.createRule({
          ...ruleData,
          test_id: props.test.id,
          position: (rules()?.length || 0) + 1,
          question_count: Math.max(1, Number(questionCount()) || 1),
        });
      }

      cancelEditRule();
      refetchRules();
    } catch (err) {
      setCompileErrors([err instanceof Error ? err.message : t("common.error")]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (isArchived()) return;
    if (!confirm(t("tests.rules.deleteConfirm"))) return;
    setDeletingRuleId(ruleId);
    setCompileErrors(null);
    setSuccessMessage(null);

    try {
      await testBuilderService.deleteRule(ruleId);
      if (editingRuleId() === ruleId) {
        cancelEditRule();
      }
      setSuccessMessage(t("tests.rules.deleteSuccess"));
      refetchRules();
    } catch (err) {
      setCompileErrors([err instanceof Error ? err.message : t("common.error")]);
    } finally {
      setDeletingRuleId(null);
    }
  };

  const handleCompileAndPublish = async () => {
    if (!props.test || isArchived()) return;
    if (rulesWithShortage().length > 0) {
      setCompileErrors([t("tests.rules.unmetRequirementsWarning")]);
      return;
    }

    setIsCompiling(true);
    setCompileErrors(null);
    setSuccessMessage(null);

    try {
      await testBuilderService.publishTestVersion(props.test.id);
      setSuccessMessage(t("tests.rules.compileSuccess"));
      refetchVersions();
      props.onPublished();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common.error");
      setCompileErrors(msg.split("\n- "));
    } finally {
      setIsCompiling(false);
    }
  };

  return (
    <Show when={props.isOpen && props.test}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
        <div class="flex max-h-[90dvh] w-full max-w-4xl flex-col rounded-2xl border border-line bg-white shadow-xl">
          {/* Header */}
          <div class="flex items-center justify-between border-b border-line px-6 py-4">
            <div>
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-bold text-ink">{t("tests.rules.modalTitle")}</h3>
                <Show when={isArchived()}>
                  <span class="rounded bg-canvas border border-line px-2 py-0.5 text-xs font-semibold text-ink-muted">
                    {t("tests.status.archived")}
                  </span>
                </Show>
              </div>
              <p class="text-xs text-ink-muted">{props.test?.title}</p>
            </div>
            <button
              type="button"
              onClick={() => props.onClose()}
              class="rounded-lg p-1 text-ink-muted hover:bg-canvas hover:text-ink"
            >
              <Icon name="x" class="size-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Archived warning */}
            <Show when={isArchived()}>
              <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 font-medium">
                {t("tests.archivedBanner")}
              </div>
            </Show>

            {/* Feedback messages */}
            <Show when={successMessage()}>
              <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {successMessage()}
              </div>
            </Show>

            <Show when={compileErrors() && compileErrors()!.length > 0}>
              <div class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <p class="font-bold">{t("tests.rules.errorsEncountered")}</p>
                <ul class="mt-1 list-disc pl-5 space-y-0.5">
                  <For each={compileErrors()!}>{(err) => <li>{err}</li>}</For>
                </ul>
              </div>
            </Show>

            {/* Published version indicator & rules status */}
            <div class="rounded-xl border border-line bg-canvas p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div class="flex items-center gap-2">
                <span class="font-bold text-ink">{t("tests.versions")}:</span>
                <Show
                  when={latestVersion()}
                  fallback={
                    <span class="rounded bg-amber-100 text-amber-800 px-2 py-0.5 font-semibold">
                      {t("tests.rules.noVersionPublished")}
                    </span>
                  }
                >
                  {(v) => (
                    <span class="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 font-semibold">
                      v{v().version_number} ({v().max_score} pts · {v().duration_minutes ? `${v().duration_minutes}m` : t("tests.assign.noTimeLimit")})
                    </span>
                  )}
                </Show>
              </div>
              <p class="text-ink-muted">
                {t("tests.rules.publishHint")}
              </p>
            </div>

            {/* Shortage warning banner before publishing */}
            <Show when={rulesWithShortage().length > 0}>
              <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
                <Icon name="report" class="size-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span class="font-bold">{t("tests.rules.unmetRequirementsWarning")}</span>
                  <p class="mt-0.5 text-amber-700">
                    {t("tests.rules.shortageDetails", { count: rulesWithShortage().length })}
                  </p>
                </div>
              </div>
            </Show>

            {/* Existing rules table */}
            <div>
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {t("tests.rules")} ({rules()?.length || 0})
                </h4>
              </div>

              <div class="mt-3 overflow-hidden rounded-xl border border-line bg-canvas">
                <Show
                  when={rules() && rules()!.length > 0}
                  fallback={
                    <div class="p-6 text-center text-sm text-ink-muted">
                      {t("tests.rules.noRules")}
                    </div>
                  }
                >
                  <table class="w-full text-left text-xs">
                    <thead class="border-b border-line bg-white font-semibold text-ink-muted">
                      <tr>
                        <th class="px-3 py-2.5">#</th>
                        <th class="px-3 py-2.5">{t("tests.rules.section")}</th>
                        <th class="px-3 py-2.5">{t("tests.rules.domain")}</th>
                        <th class="px-3 py-2.5">{t("tests.rules.difficulty")}</th>
                        <th class="px-3 py-2.5">{t("tests.rules.type")}</th>
                        <th class="px-3 py-2.5">{t("tests.rules.count")}</th>
                        <th class="px-3 py-2.5">{t("tests.rules.bankAvailability")}</th>
                        <th class="px-3 py-2.5 text-right">{t("tests.rules.actions")}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-line">
                      <For each={rules()}>
                        {(r, idx) => {
                          const avail = () => getRuleAvailability(r);
                          const hasShortage = () => avail() < r.question_count;
                          const isBeingEdited = () => editingRuleId() === r.id;

                          return (
                            <tr class={`transition-colors ${isBeingEdited() ? "bg-brand/5 font-medium" : "hover:bg-white/60"}`}>
                              <td class="px-3 py-2.5 font-mono text-ink-muted">{idx() + 1}</td>
                              <td class="px-3 py-2.5 font-medium text-ink">{r.section_title || "General"}</td>
                              <td class="px-3 py-2.5 text-ink-muted">
                                {r.domain_id ? formatDomainName(r.domain_id, locale()) : t("common.all")}
                              </td>
                              <td class="px-3 py-2.5 text-ink-muted">{r.difficulty || t("common.all")}</td>
                              <td class="px-3 py-2.5 text-ink-muted">{r.question_type || t("common.all")}</td>
                              <td class="px-3 py-2.5 font-bold text-ink">{r.question_count}</td>
                              <td class="px-3 py-2.5">
                                <Show
                                  when={!hasShortage()}
                                  fallback={
                                    <span class="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200">
                                      {t("tests.rules.insufficient", { count: r.question_count, available: avail() })}
                                    </span>
                                  }
                                >
                                  <span class="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                                    {t("tests.rules.satisfiable", { count: r.question_count, available: avail() })}
                                  </span>
                                </Show>
                              </td>
                              <td class="px-3 py-2.5 text-right">
                                <div class="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => startEditRule(r, idx() + 1)}
                                    disabled={isArchived()}
                                    title={t("tests.rules.edit")}
                                    class="rounded p-1 text-ink-muted hover:bg-brand/10 hover:text-brand disabled:opacity-30"
                                  >
                                    <Icon name="pencil" class="size-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRule(r.id)}
                                    disabled={isArchived() || deletingRuleId() === r.id}
                                    title={t("tests.rules.delete")}
                                    class="rounded p-1 text-ink-muted hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                                  >
                                    <Icon name="x" class="size-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }}
                      </For>
                    </tbody>
                  </table>
                </Show>
              </div>
            </div>

            {/* Add / Edit rule form */}
            <Show when={!isArchived()}>
              <div class={`rounded-xl border p-4 bg-white space-y-4 ${editingRuleId() ? "border-brand ring-2 ring-brand/10" : "border-line"}`}>
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-bold uppercase tracking-wider text-ink">
                    {editingRuleId()
                      ? t("tests.rules.editingTitle", { index: editingRuleIndex() })
                      : t("tests.rules.add")}
                  </h4>
                  <Show when={editingRuleId()}>
                    <button
                      type="button"
                      onClick={cancelEditRule}
                      class="text-xs font-semibold text-brand hover:underline"
                    >
                      {t("tests.rules.cancelEdit")}
                    </button>
                  </Show>
                </div>

                {/* Real-time Question Bank Availability Indicator */}
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-canvas p-3 border border-line text-xs">
                  <div class="flex items-center gap-2">
                    <span class="font-medium text-ink-muted">{t("tests.rules.bankAvailability")}:</span>
                    <Show
                      when={availableForCurrentFilter() > 0}
                      fallback={
                        <span class="inline-flex items-center gap-1 font-bold text-amber-700">
                          <Icon name="report" class="size-3.5 text-amber-600" />
                          {t("tests.rules.noQuestionsAvailable")}
                        </span>
                      }
                    >
                      <span class="inline-flex items-center gap-1 font-bold text-emerald-700">
                        <Icon name="check" class="size-3.5 text-emerald-600" />
                        {availableForCurrentFilter()} {t("tests.rules.availableQuestions")}
                      </span>
                    </Show>
                  </div>

                  <Show when={questionCount() > availableForCurrentFilter()}>
                    <span class="text-rose-700 font-semibold">
                      ⚠️ {t("tests.rules.insufficientQuestions", {
                        requested: questionCount(),
                        available: availableForCurrentFilter(),
                      })}
                    </span>
                  </Show>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-ink-muted">{t("tests.rules.section")}</label>
                    <input
                      type="text"
                      value={sectionTitle()}
                      onInput={(e) => setSectionTitle(e.currentTarget.value)}
                      placeholder={t("tests.rules.sectionPlaceholder")}
                      class="mt-1 w-full rounded-xl border border-line px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
                    />
                  </div>

                  <div>
                    <label class="block text-xs font-semibold text-ink-muted">{t("tests.rules.domain")}</label>
                    <select
                      value={selectedDomainId()}
                      onChange={(e) => setSelectedDomainId(e.currentTarget.value)}
                      class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
                    >
                      <option value="">{t("questions.allDomains")}</option>
                      <For each={CANONICAL_COURSES}>
                        {(course) => {
                          const courseDomainIds = () =>
                            getDomainsForCourse(course.id, catalog()?.courseDomains ?? []);
                          const courseDomains = () =>
                            (domains() ?? []).filter((d) => courseDomainIds().includes(d.id));
                          return (
                            <Show when={courseDomains().length > 0}>
                              <optgroup label={formatCourseLabel(course.id, locale())}>
                                <For each={courseDomains()}>
                                  {(d) => (
                                    <option value={d.id}>
                                      {formatDomainName(d, locale())}
                                    </option>
                                  )}
                                </For>
                              </optgroup>
                            </Show>
                          );
                        }}
                      </For>
                    </select>
                  </div>

                  <div>
                    <label class="block text-xs font-semibold text-ink-muted">{t("tests.rules.difficulty")}</label>
                    <select
                      value={selectedDifficulty()}
                      onChange={(e) => setSelectedDifficulty(e.currentTarget.value as QuestionDifficulty | "")}
                      class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
                    >
                      <option value="">{t("tests.rules.anyDifficulty")}</option>
                      <option value="easy">{t("questions.difficulty.easy")}</option>
                      <option value="medium">{t("questions.difficulty.medium")}</option>
                      <option value="hard">{t("questions.difficulty.hard")}</option>
                    </select>
                  </div>

                  <div>
                    <label class="block text-xs font-semibold text-ink-muted">{t("tests.rules.type")}</label>
                    <select
                      value={selectedType()}
                      onChange={(e) => setSelectedType(e.currentTarget.value as QuestionType | "")}
                      class="mt-1 w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
                    >
                      <option value="">{t("tests.rules.anyQuestionType")}</option>
                      <option value="single_choice">{t("questions.type.singleChoice")}</option>
                      <option value="multiple_choice">{t("questions.type.multipleChoice")}</option>
                      <option value="true_false">{t("questions.type.trueFalse")}</option>
                      <option value="numeric">{t("questions.type.numeric")}</option>
                    </select>
                  </div>

                  <div>
                    <label class="block text-xs font-semibold text-ink-muted">{t("tests.rules.count")}</label>
                    <input
                      type="number"
                      min="1"
                      max={Math.max(availableForCurrentFilter(), 50)}
                      value={questionCount()}
                      onInput={(e) => setQuestionCount(Number(e.currentTarget.value) || 1)}
                      class="mt-1 w-full rounded-xl border border-line px-3 py-1.5 text-xs text-ink outline-none focus:border-brand"
                    />
                  </div>

                  <div class="flex items-end gap-2">
                    <Button
                      type="button"
                      variant={editingRuleId() ? "primary" : "secondary"}
                      class="w-full !text-xs !py-1.5"
                      disabled={isSubmitting()}
                      onClick={handleSaveRule}
                    >
                      <Show when={editingRuleId()} fallback={t("tests.rules.add")}>
                        {t("tests.rules.update")}
                      </Show>
                    </Button>
                    <Show when={editingRuleId()}>
                      <Button
                        type="button"
                        variant="secondary"
                        class="!text-xs !py-1.5"
                        onClick={cancelEditRule}
                      >
                        {t("common.cancel")}
                      </Button>
                    </Show>
                  </div>
                </div>
              </div>
            </Show>
          </div>

          {/* Footer actions */}
          <div class="flex items-center justify-between border-t border-line px-6 py-4">
            <Button variant="secondary" type="button" onClick={props.onClose}>
              {t("common.back")}
            </Button>
            <Button
              type="button"
              disabled={
                isCompiling() ||
                isArchived() ||
                !rules() ||
                rules()!.length === 0 ||
                rulesWithShortage().length > 0
              }
              onClick={handleCompileAndPublish}
            >
              <Icon name="check" class="mr-1.5 size-4" />
              {isCompiling() ? t("common.saving") : t("tests.publish")}
            </Button>
          </div>
        </div>
      </div>
    </Show>
  );
};
