import { createEffect, createMemo, createSignal, For, Show, type Component } from "solid-js";
import { createStore } from "solid-js/store";

import {
  CANONICAL_COURSES,
  formatCategoryName,
  formatCourseLabel,
  formatDomainName,
  getCategoriesForCourse,
  getCategoryForDomain,
  getCoursesForDomain,
  getDomainsForCourseAndCategory,
} from "../../lib/curriculum";
import { extractErrorMessage } from "../../lib/errors";
import { useI18n } from "../../lib/i18n";
import {
  questionBankService,
  validateQuestionDraft,
  validateQuestionPublication,
  type CurriculumCatalog,
  type QuestionOptionInput,
} from "../../services/question-bank";
import type { JsonObject, QuestionBankItem, QuestionDifficulty, QuestionType } from "../../services/schema";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

interface QuestionFormProps {
  isOpen: boolean;
  catalog: CurriculumCatalog | undefined;
  onClose: () => void;
  onSuccess: () => void;
  initialQuestion?: QuestionBankItem | null;
}

const inputClass =
  "min-h-11 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10 disabled:bg-canvas-soft disabled:text-ink-muted";

const initialOptions = (): QuestionOptionInput[] =>
  ["A", "B", "C", "D"].map((optionKey, index) => ({
    option_key: optionKey,
    content: "",
    is_correct: index === 0,
    position: index,
  }));

const relationId = (relation: string | { id: string } | null | undefined): string => {
  if (!relation) return "";
  return typeof relation === "string" ? relation : relation.id;
};

export const QuestionForm: Component<QuestionFormProps> = (props) => {
  const { locale, t } = useI18n();
  const [prompt, setPrompt] = createSignal("");
  const [explanation, setExplanation] = createSignal("");
  const [externalId, setExternalId] = createSignal("");
  const [questionType, setQuestionType] = createSignal<QuestionType>("single_choice");
  const [difficulty, setDifficulty] = createSignal<QuestionDifficulty>("medium");
  const [language, setLanguage] = createSignal<string>(locale());
  const [visibility, setVisibility] = createSignal<"private" | "school">("private");
  const [courseId, setCourseId] = createSignal("");
  const [categoryId, setCategoryId] = createSignal("");
  const [domainId, setDomainId] = createSignal("");
  const [clusterId, setClusterId] = createSignal("");
  const [standardId, setStandardId] = createSignal("");
  const [substandardId, setSubstandardId] = createSignal("");
  const [numericAnswer, setNumericAnswer] = createSignal("");
  const [numericTolerance, setNumericTolerance] = createSignal("0");
  const [options, setOptions] = createStore<QuestionOptionInput[]>(initialOptions());
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  const isReadOnly = createMemo(() => {
    return props.initialQuestion?.status === "published" || props.initialQuestion?.status === "archived";
  });

  const availableCategories = createMemo(() => {
    if (!props.catalog) return [];
    return getCategoriesForCourse(courseId(), {
      categories: props.catalog.categories ?? [],
      domains: props.catalog.domains ?? [],
      courseDomains: props.catalog.courseDomains ?? [],
    });
  });

  const availableDomains = createMemo(() => {
    if (!props.catalog) return [];
    return getDomainsForCourseAndCategory(courseId(), categoryId(), {
      domains: props.catalog.domains ?? [],
      courseDomains: props.catalog.courseDomains ?? [],
    });
  });

  const clusters = createMemo(() =>
    (props.catalog?.clusters ?? []).filter(
      (cluster) => relationId(cluster.domain_id) === domainId(),
    ),
  );
  const standards = createMemo(() =>
    (props.catalog?.standards ?? []).filter(
      (standard) => relationId(standard.cluster_id) === clusterId(),
    ),
  );
  const substandards = createMemo(() =>
    (props.catalog?.substandards ?? []).filter(
      (substandard) => relationId(substandard.standard_id) === standardId(),
    ),
  );
  const isChoiceQuestion = createMemo(() =>
    ["single_choice", "multiple_choice", "true_false"].includes(questionType()),
  );

  createEffect(() => {
    if (!props.isOpen) return;
    setErrorMessage(null);

    const q = props.initialQuestion;
    if (q) {
      setPrompt(q.prompt ?? "");
      setExplanation(q.explanation ?? "");
      setExternalId(q.external_id ?? "");
      setQuestionType(q.question_type);
      setDifficulty(q.difficulty);
      setLanguage(q.language);
      setVisibility(q.visibility === "school" ? "school" : "private");
      const dId = relationId(q.domain_id);
      setDomainId(dId);
      const catId = getCategoryForDomain(dId, props.catalog?.domains ?? []);
      setCategoryId(catId ?? "");
      const matchingCourses = getCoursesForDomain(dId, props.catalog?.courseDomains ?? []);
      if (matchingCourses.length === 1 && matchingCourses[0]) {
        setCourseId(matchingCourses[0]);
      } else if (matchingCourses.length > 1 && matchingCourses[0]) {
        if (!matchingCourses.includes(courseId())) {
          setCourseId(matchingCourses[0]);
        }
      } else {
        setCourseId("");
      }
      setClusterId(relationId(q.cluster_id));
      setStandardId(relationId(q.standard_id));
      setSubstandardId(relationId(q.substandard_id));

      if (q.question_type === "numeric") {
        setNumericAnswer(
          q.answer_config?.correct_value !== undefined ? String(q.answer_config.correct_value) : "",
        );
        setNumericTolerance(
          q.answer_config?.tolerance !== undefined ? String(q.answer_config.tolerance) : "0",
        );
      }

      // Load existing options asynchronously
      void questionBankService.getOptions(q.id).then((savedOptions) => {
        if (savedOptions.length > 0) {
          setOptions(
            savedOptions.map((opt) => ({
              option_key: opt.option_key,
              content: opt.content,
              is_correct: opt.is_correct,
              position: opt.position,
              feedback: opt.feedback,
            })),
          );
        } else {
          setOptions(initialOptions());
        }
      });
    } else {
      setPrompt("");
      setExplanation("");
      setExternalId("");
      setQuestionType("single_choice");
      setDifficulty("medium");
      setLanguage(locale());
      setVisibility("private");
      setCourseId("");
      setCategoryId("");
      setDomainId("");
      setClusterId("");
      setStandardId("");
      setSubstandardId("");
      setNumericAnswer("");
      setNumericTolerance("0");
      setOptions(initialOptions());
    }
  });

  const setCorrectOption = (index: number, checked: boolean): void => {
    if (isReadOnly()) return;
    if (questionType() === "multiple_choice") {
      setOptions(index, "is_correct", checked);
      return;
    }
    options.forEach((_, optionIndex) => setOptions(optionIndex, "is_correct", optionIndex === index));
  };

  const getFormData = () => {
    const answerConfig: JsonObject = {};
    if (questionType() === "numeric") {
      const value = Number(numericAnswer());
      const tolerance = Number(numericTolerance());
      answerConfig.correct_value = value;
      answerConfig.tolerance = tolerance;
    }

    return {
      external_id: externalId() || null,
      question_type: questionType(),
      prompt: prompt(),
      explanation: explanation() || null,
      difficulty: difficulty(),
      language: language(),
      domain_id: domainId(),
      cluster_id: clusterId() || null,
      standard_id: standardId() || null,
      substandard_id: substandardId() || null,
      course_id: courseId() || null,
      visibility: visibility(),
      answer_config: answerConfig,
      options: isChoiceQuestion() ? [...options] : [],
    } as const;
  };

  const handleSaveDraft = async (event: Event): Promise<void> => {
    event.preventDefault();
    setErrorMessage(null);

    const input = getFormData();
    const validation = validateQuestionDraft(input);
    if (!validation.valid) {
      setErrorMessage(t("questions.form.validation"));
      return;
    }

    setIsSubmitting(true);
    try {
      if (props.initialQuestion?.id) {
        await questionBankService.updateQuestion(props.initialQuestion.id, input);
      } else {
        await questionBankService.createQuestion(input);
      }
      props.onSuccess();
      props.onClose();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, t("common.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async (): Promise<void> => {
    setErrorMessage(null);
    const input = getFormData();
    const publicationValidation = validateQuestionPublication(input, input.options, {
      requireStandard: true,
    });
    if (!publicationValidation.valid) {
      const errorStrings = publicationValidation.errors.map((errKey) => {
        if (errKey === "choiceMinOptions") return t("questions.rules.choiceMinOptions");
        if (errKey === "singleChoiceOneCorrect") return t("questions.rules.singleChoiceOneCorrect");
        if (errKey === "multipleChoiceMinOneCorrect") return t("questions.rules.multipleChoiceMinOneCorrect");
        if (errKey === "trueFalseTwoOptions") return t("questions.rules.trueFalseTwoOptions");
        if (errKey === "numericValueRequired") return t("questions.rules.numericValueRequired");
        if (errKey === "standardRequired") return t("questions.rules.standardRequired");
        return t("questions.form.validation");
      });
      setErrorMessage(errorStrings.join(". "));
      return;
    }

    setIsSubmitting(true);
    try {
      let questionId = props.initialQuestion?.id;
      if (questionId) {
        await questionBankService.updateQuestion(questionId, input);
      } else {
        const created = await questionBankService.createQuestion(input);
        questionId = created.id;
      }
      await questionBankService.publishQuestion(questionId);
      props.onSuccess();
      props.onClose();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, t("common.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = async (): Promise<void> => {
    if (!props.initialQuestion?.id) return;
    setIsSubmitting(true);
    try {
      await questionBankService.duplicateQuestion(props.initialQuestion.id);
      props.onSuccess();
      props.onClose();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, t("common.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchive = async (): Promise<void> => {
    if (!props.initialQuestion?.id) return;
    setIsSubmitting(true);
    try {
      await questionBankService.archiveQuestion(props.initialQuestion.id);
      props.onSuccess();
      props.onClose();
    } catch (error) {
      setErrorMessage(extractErrorMessage(error, t("common.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalTitle = createMemo(() => {
    if (!props.initialQuestion) return t("questions.form.title");
    if (isReadOnly()) return t("questions.form.viewTitle");
    return t("questions.form.editTitle");
  });

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={modalTitle()}
      maxWidth="3xl"
    >
      <form class="space-y-5" onSubmit={(event) => void handleSaveDraft(event)}>
        <Show when={isReadOnly()}>
          <div role="alert" class="rounded-xl border border-line bg-canvas-soft px-4 py-3 text-xs font-semibold text-ink-muted">
            {t("questions.form.immutableHelp")}
          </div>
        </Show>

        <div>
          <label class="mb-1.5 block text-sm font-semibold text-ink" for="question-prompt">
            {t("questions.form.prompt")}
          </label>
          <textarea
            id="question-prompt"
            required
            rows={4}
            disabled={isReadOnly()}
            class={`${inputClass} resize-y`}
            value={prompt()}
            onInput={(event) => setPrompt(event.currentTarget.value)}
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label class="text-sm font-semibold text-ink">
            {t("questions.form.type")}
            <select
              disabled={isReadOnly()}
              class={`${inputClass} mt-1.5`}
              value={questionType()}
              onChange={(event) => setQuestionType(event.currentTarget.value as QuestionType)}
            >
              <option value="single_choice">{t("questions.type.singleChoice")}</option>
              <option value="multiple_choice">{t("questions.type.multipleChoice")}</option>
              <option value="true_false">{t("questions.type.trueFalse")}</option>
              <option value="numeric">{t("questions.type.numeric")}</option>
              <option value="short_text">{t("questions.type.shortText")}</option>
            </select>
          </label>
          <label class="text-sm font-semibold text-ink">
            {t("questions.form.difficulty")}
            <select
              disabled={isReadOnly()}
              class={`${inputClass} mt-1.5`}
              value={difficulty()}
              onChange={(event) => setDifficulty(event.currentTarget.value as QuestionDifficulty)}
            >
              <option value="easy">{t("questions.difficulty.easy")}</option>
              <option value="medium">{t("questions.difficulty.medium")}</option>
              <option value="hard">{t("questions.difficulty.hard")}</option>
            </select>
          </label>
          <label class="text-sm font-semibold text-ink">
            {t("questions.form.visibility")}
            <select
              disabled={isReadOnly()}
              class={`${inputClass} mt-1.5`}
              value={visibility()}
              onChange={(event) => setVisibility(event.currentTarget.value as "private" | "school")}
            >
              <option value="private">{t("questions.visibility.private")}</option>
              <option value="school">{t("questions.visibility.school")}</option>
            </select>
          </label>
          <label class="text-sm font-semibold text-ink">
            {t("nav.language")}
            <select
              disabled={isReadOnly()}
              class={`${inputClass} mt-1.5`}
              value={language()}
              onChange={(event) => setLanguage(event.currentTarget.value)}
            >
              <option value="en">{t("language.en")}</option>
              <option value="es">{t("language.es")}</option>
              <option value="it">{t("language.it")}</option>
            </select>
          </label>
        </div>

        <div class="rounded-2xl border border-line bg-canvas-soft p-4">
          <p class="text-sm font-bold text-ink">{t("questions.form.curriculum")}</p>
          <p class="mt-1 text-xs text-ink-muted">{t("questions.form.curriculumHelp")}</p>
          <div class="mt-4 grid gap-4 sm:grid-cols-3">
            <label class="text-sm font-semibold text-ink">
              {t("questions.grade")}
              <select
                disabled={isReadOnly()}
                class={`${inputClass} mt-1.5`}
                value={courseId()}
                onChange={(event) => {
                  const newCourse = event.currentTarget.value;
                  setCourseId(newCourse);
                  if (categoryId()) {
                    const validCats = getCategoriesForCourse(newCourse, {
                      categories: props.catalog?.categories ?? [],
                      domains: props.catalog?.domains ?? [],
                      courseDomains: props.catalog?.courseDomains ?? [],
                    });
                    if (!validCats.some((c) => c.id === categoryId() || c.code === categoryId())) {
                      setCategoryId("");
                    }
                  }
                  if (domainId()) {
                    const validDomains = getDomainsForCourseAndCategory(newCourse, categoryId(), {
                      domains: props.catalog?.domains ?? [],
                      courseDomains: props.catalog?.courseDomains ?? [],
                    });
                    if (!validDomains.some((d) => d.id === domainId() || d.code === domainId())) {
                      setDomainId("");
                      setClusterId("");
                      setStandardId("");
                      setSubstandardId("");
                    }
                  }
                }}
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
            </label>
            <label class="text-sm font-semibold text-ink">
              {t("questions.category")}
              <select
                disabled={isReadOnly()}
                class={`${inputClass} mt-1.5`}
                value={categoryId()}
                onChange={(event) => {
                  const newCat = event.currentTarget.value;
                  setCategoryId(newCat);
                  if (domainId()) {
                    const validDomains = getDomainsForCourseAndCategory(courseId(), newCat, {
                      domains: props.catalog?.domains ?? [],
                      courseDomains: props.catalog?.courseDomains ?? [],
                    });
                    if (!validDomains.some((d) => d.id === domainId() || d.code === domainId())) {
                      setDomainId("");
                      setClusterId("");
                      setStandardId("");
                      setSubstandardId("");
                    }
                  }
                }}
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
            </label>
            <label class="text-sm font-semibold text-ink">
              {t("questions.domain")}
              <select
                required
                disabled={isReadOnly()}
                class={`${inputClass} mt-1.5`}
                value={domainId()}
                onChange={(event) => {
                  const newDomain = event.currentTarget.value;
                  setDomainId(newDomain);
                  if (newDomain && !categoryId()) {
                    const inferredCat = getCategoryForDomain(newDomain, props.catalog?.domains ?? []);
                    if (inferredCat) setCategoryId(inferredCat);
                  }
                  setClusterId("");
                  setStandardId("");
                  setSubstandardId("");
                }}
              >
                <option value="">{t("questions.form.selectDomain")}</option>
                <For each={availableDomains()}>
                  {(domain) => (
                    <option value={domain.id}>
                      {formatDomainName(domain, locale())}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </div>
          <div class="mt-4 grid gap-4 sm:grid-cols-3">
            <label class="text-sm font-semibold text-ink">
              {t("questions.cluster")}
              <select
                class={`${inputClass} mt-1.5`}
                value={clusterId()}
                disabled={isReadOnly() || !domainId()}
                onChange={(event) => {
                  setClusterId(event.currentTarget.value);
                  setStandardId("");
                  setSubstandardId("");
                }}
              >
                <option value="">{t("questions.form.optional")}</option>
                <For each={clusters()}>
                  {(cluster) => (
                    <option value={cluster.id}>{cluster.code} · {String(cluster.name[locale()] || cluster.name.es || cluster.name.en || cluster.code)}</option>
                  )}
                </For>
              </select>
            </label>
            <label class="text-sm font-semibold text-ink">
              {t("questions.standard")}
              <span class="ml-1 text-xs font-normal text-brand font-medium">({t("questions.form.requiredForPublish")})</span>
              <select
                class={`${inputClass} mt-1.5`}
                value={standardId()}
                disabled={isReadOnly() || !clusterId()}
                onChange={(event) => {
                  setStandardId(event.currentTarget.value);
                  setSubstandardId("");
                }}
              >
                <option value="">{t("questions.form.optional")}</option>
                <For each={standards()}>
                  {(standard) => (
                    <option value={standard.id}>
                      {standard.code || standard.id} · {String(standard.description?.[locale()] || standard.description?.["es"] || standard.description?.["en"] || standard.id).slice(0, 70)}
                    </option>
                  )}
                </For>
              </select>
            </label>
            <label class="text-sm font-semibold text-ink">
              {t("questions.substandard")}
              <select
                class={`${inputClass} mt-1.5`}
                value={substandardId()}
                disabled={isReadOnly() || !standardId()}
                onChange={(event) => setSubstandardId(event.currentTarget.value)}
              >
                <option value="">{t("questions.form.optional")}</option>
                <For each={substandards()}>
                  {(substandard) => (
                    <option value={substandard.id}>
                      {substandard.code || substandard.id} · {String(substandard.description?.[locale()] || substandard.description?.["es"] || substandard.description?.["en"] || substandard.id).slice(0, 70)}
                    </option>
                  )}
                </For>
              </select>
            </label>
          </div>
        </div>

        <Show when={isChoiceQuestion()}>
          <fieldset>
            <legend class="text-sm font-bold text-ink">{t("questions.form.options")}</legend>
            <div class="mt-3 space-y-3">
              <For each={options}>
                {(option, index) => (
                  <div class="flex items-center gap-3">
                    <input
                      aria-label={t("questions.form.correct")}
                      type={questionType() === "multiple_choice" ? "checkbox" : "radio"}
                      name="correct-option"
                      disabled={isReadOnly()}
                      checked={option.is_correct}
                      onChange={(event) => setCorrectOption(index(), event.currentTarget.checked)}
                    />
                    <span class="w-5 text-sm font-bold text-ink-muted">{option.option_key}</span>
                    <input
                      disabled={isReadOnly()}
                      class={inputClass}
                      value={option.content}
                      placeholder={t("questions.form.optionPlaceholder")}
                      onInput={(event) => setOptions(index(), "content", event.currentTarget.value)}
                    />
                  </div>
                )}
              </For>
            </div>
          </fieldset>
        </Show>

        <Show when={questionType() === "numeric"}>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="text-sm font-semibold text-ink">
              {t("questions.form.numericAnswer")}
              <input
                required
                disabled={isReadOnly()}
                type="number"
                step="any"
                class={`${inputClass} mt-1.5`}
                value={numericAnswer()}
                onInput={(event) => setNumericAnswer(event.currentTarget.value)}
              />
            </label>
            <label class="text-sm font-semibold text-ink">
              {t("questions.form.tolerance")}
              <input
                required
                disabled={isReadOnly()}
                min="0"
                type="number"
                step="any"
                class={`${inputClass} mt-1.5`}
                value={numericTolerance()}
                onInput={(event) => setNumericTolerance(event.currentTarget.value)}
              />
            </label>
          </div>
        </Show>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="text-sm font-semibold text-ink">
            {t("questions.form.externalId")}
            <input
              disabled={isReadOnly()}
              class={`${inputClass} mt-1.5`}
              value={externalId()}
              onInput={(event) => setExternalId(event.currentTarget.value)}
            />
          </label>
          <label class="text-sm font-semibold text-ink">
            {t("questions.form.explanation")}
            <input
              disabled={isReadOnly()}
              class={`${inputClass} mt-1.5`}
              value={explanation()}
              onInput={(event) => setExplanation(event.currentTarget.value)}
            />
          </label>
        </div>

        <Show when={errorMessage()}>
          <p role="alert" class="rounded-xl bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            {errorMessage()}
          </p>
        </Show>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <Show when={props.initialQuestion}>
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting()}
                onClick={() => void handleDuplicate()}
              >
                {t("questions.form.duplicate")}
              </Button>
            </Show>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <Button type="button" variant="ghost" onClick={props.onClose}>
              {t("common.cancel")}
            </Button>
            <Show when={!isReadOnly()}>
              <Button type="submit" variant="secondary" disabled={isSubmitting()}>
                {isSubmitting() ? t("common.saving") : t("questions.form.saveDraft")}
              </Button>
              <Button
                type="button"
                disabled={isSubmitting()}
                onClick={() => void handlePublish()}
              >
                {t("questions.form.publish")}
              </Button>
            </Show>
            <Show when={isReadOnly() && props.initialQuestion?.status === "published"}>
              <Button
                type="button"
                variant="danger"
                disabled={isSubmitting()}
                onClick={() => void handleArchive()}
              >
                {t("questions.form.archive")}
              </Button>
            </Show>
          </div>
        </div>
      </form>
    </Modal>
  );
};
