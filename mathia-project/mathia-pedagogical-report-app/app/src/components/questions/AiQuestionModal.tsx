import { createEffect, createMemo, createSignal, For, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Modal";
import { useI18n, type Locale } from "../../lib/i18n";
import {
  generateAiQuestions,
  questionBankService,
  type CreateQuestionInput,
  type CurriculumCatalog,
  type GeneratedQuestionItem,
} from "../../services/question-bank";
import { CANONICAL_COURSES, formatCourseLabel, relationId } from "../../lib/curriculum";
import { extractErrorMessage } from "../../lib/errors";
import type { LocalizedText } from "../../services/schema";

interface AiQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  catalog: CurriculumCatalog | null;
  onSuccess: (count: number) => void;
}

const questionTypeKeys = {
  single_choice: "questions.type.singleChoice",
  multiple_choice: "questions.type.multipleChoice",
  true_false: "questions.type.trueFalse",
  numeric: "questions.type.numeric",
} as const;

const difficultyKeys = {
  easy: "questions.difficulty.easy",
  medium: "questions.difficulty.medium",
  hard: "questions.difficulty.hard",
} as const;

function getLocalized(text: LocalizedText | string | undefined | null, locale: Locale, fallback = ""): string {
  if (!text) return fallback;
  if (typeof text === "string") return text;
  const localized = text[locale];
  return typeof localized === "string" && localized ? localized : text.es || text.en || fallback;
}

export const AiQuestionModal: Component<AiQuestionModalProps> = (props) => {
  const { locale, t } = useI18n();

  // Form selections
  const [courseId, setCourseId] = createSignal("grade-6");
  const [domainId, setDomainId] = createSignal("");
  const [clusterId, setClusterId] = createSignal("");
  const [standardId, setStandardId] = createSignal("");
  const [substandardId, setSubstandardId] = createSignal("");
  const [questionType, setQuestionType] = createSignal<
    "single_choice" | "multiple_choice" | "true_false" | "numeric"
  >("single_choice");
  const [difficulty, setDifficulty] = createSignal<"easy" | "medium" | "hard">("medium");
  const [language, setLanguage] = createSignal<Locale>(locale());
  const [quantity, setQuantity] = createSignal(3);

  // Flow signals
  const [isGenerating, setIsGenerating] = createSignal(false);
  const [isSaving, setIsSaving] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [previewItems, setPreviewItems] = createSignal<GeneratedQuestionItem[]>([]);

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

  const availableSubstandards = createMemo(() => {
    const cat = props.catalog;
    if (!cat || !standardId()) return [];
    return cat.substandards.filter((sub) => relationId(sub.standard_id) === standardId());
  });

  const handleCourseChange = (id: string) => {
    setCourseId(id);
    setDomainId("");
    setClusterId("");
    setStandardId("");
    setSubstandardId("");
  };

  const handleDomainChange = (id: string) => {
    setDomainId(id);
    setClusterId("");
    setStandardId("");
    setSubstandardId("");
  };

  const handleClusterChange = (id: string) => {
    setClusterId(id);
    setStandardId("");
    setSubstandardId("");
  };

  const handleStandardChange = (id: string) => {
    setStandardId(id);
    setSubstandardId("");
  };

  const handleGenerate = async () => {
    if (!standardId()) {
      setErrorMessage(t("aiForm.requiredStandardError"));
      return;
    }
    setErrorMessage(null);
    setIsGenerating(true);
    try {
      // The API needs the complete curriculum route. When the user leaves the
      // optional cluster selector at "all", derive it from the selected standard.
      const selectedStandard = props.catalog?.standards.find((standard) => standard.id === standardId());
      const resolvedClusterId = relationId(selectedStandard?.cluster_id);
      if (!resolvedClusterId) {
        setErrorMessage(t("aiForm.clusterError"));
        return;
      }
      const res = await generateAiQuestions({
        course_id: courseId(),
        domain_id: domainId(),
        cluster_id: resolvedClusterId,
        standard_id: standardId(),
        substandard_id: substandardId() || null,
        question_type: questionType(),
        difficulty: difficulty(),
        language: language(),
        quantity: Math.min(Math.max(1, quantity()), 25),
      });
      const generatedItems: GeneratedQuestionItem[] = res.questions.map((item) => {
        const curriculum = item.curriculum;
        const domain = props.catalog?.domains.find((entry) => entry.code === curriculum.domain_code);
        const cluster = props.catalog?.clusters.find((entry) => entry.code === curriculum.cluster_code);
        const standard = props.catalog?.standards.find((entry) => entry.code === curriculum.standard_code);
        const substandard = props.catalog?.substandards.find((entry) => entry.code === curriculum.substandard_code);
        return {
          prompt: item.prompt,
          question_type: item.question_type,
          difficulty: item.difficulty,
          language: item.language,
          domain_id: domain?.id ?? domainId(),
          cluster_id: cluster?.id ?? resolvedClusterId,
          standard_id: standard?.id ?? standardId(),
          substandard_id: substandard?.id ?? (substandardId() || null),
          explanation: item.explanation ?? null,
          options: item.options?.map((option, position) => ({
            option_key: option.key,
            content: option.content,
            is_correct: item.correct_options?.includes(option.key) ?? false,
            position,
          })),
          answer_config: item.answer_config as Record<string, unknown> | undefined,
        } as GeneratedQuestionItem;
      });
      setPreviewItems(generatedItems);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, t("common.error")));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemovePreviewItem = (index: number) => {
    setPreviewItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateItemPrompt = (index: number, newPrompt: string) => {
    setPreviewItems((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], prompt: newPrompt };
      }
      return next;
    });
  };

  const handleSaveToBank = async () => {
    const items = previewItems();
    if (items.length === 0) return;

    setIsSaving(true);
    setErrorMessage(null);

    const mappedInputs: CreateQuestionInput[] = items.map((item) => {
      const diff: "easy" | "medium" | "hard" = item.difficulty === "easy"
        ? "easy"
        : item.difficulty === "hard"
          ? "hard"
          : "medium";

      const staticInput: CreateQuestionInput = {
        question_type: item.question_type,
        prompt: item.prompt,
        difficulty: diff,
        language: item.language,
        domain_id: item.domain_id,
        course_id: courseId(),
        visibility: "private",
        source: "ai",
      };
      if (item.explanation !== undefined) staticInput.explanation = item.explanation;
      if (item.cluster_id !== undefined) staticInput.cluster_id = item.cluster_id;
      if (item.standard_id !== undefined) staticInput.standard_id = item.standard_id;
      if (item.substandard_id !== undefined) staticInput.substandard_id = item.substandard_id;
      if (item.answer_config !== undefined) staticInput.answer_config = item.answer_config as any;
      if (item.options !== undefined) {
        staticInput.options = item.options.map((opt) => ({
          option_key: opt.option_key,
          content: opt.content,
          is_correct: opt.is_correct,
          position: opt.position,
          feedback: opt.feedback ?? null,
        }));
      }
      return staticInput;
    });

    try {
      const result = await questionBankService.importBatch({
        source: "ai",
        items: mappedInputs,
      });
      props.onSuccess(result.imported);
      props.onClose();
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, t("common.error")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("questions.aiGenerate.title")}
      maxWidth="3xl"
    >
      <div class="space-y-6 max-h-[80vh] overflow-y-auto px-1">
        <p class="text-xs text-ink-muted">
          {t("questions.aiGenerate.description")}
        </p>

        {/* Guided Parameters Form */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-2xl border border-line bg-canvas-soft p-4 text-xs">
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
            <label class="block font-semibold text-ink mb-1">{t("questions.domain")}:</label>
            <select
              value={domainId()}
              onChange={(e) => handleDomainChange(e.currentTarget.value)}
              class="w-full rounded-xl border border-line bg-white p-2 text-xs"
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
              onChange={(e) => handleClusterChange(e.currentTarget.value)}
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

          {/* Standard (mandatory) */}
          <div>
            <label class="block font-semibold text-ink mb-1">
              {t("questions.standard")} <span class="text-danger">* ({t("aiForm.required")})</span>:
            </label>
            <select
              value={standardId()}
              onChange={(e) => handleStandardChange(e.currentTarget.value)}
              disabled={!domainId()}
              class="w-full rounded-xl border border-line bg-white p-2 text-xs disabled:opacity-50 font-medium"
            >
              <option value="">{t("aiForm.selectStandard")}</option>
              <For each={availableStandards()}>
                {(s) => (
                  <option value={s.id}>
                    {s.code} - {getLocalized(s.description, locale(), s.code).slice(0, 50)}...
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Substandard (optional) */}
          <div>
            <label class="block font-semibold text-ink mb-1">{t("questions.substandard")} ({t("questions.form.optional")}):</label>
            <select
              value={substandardId()}
              onChange={(e) => setSubstandardId(e.currentTarget.value)}
              disabled={!standardId() || availableSubstandards().length === 0}
              class="w-full rounded-xl border border-line bg-white p-2 text-xs disabled:opacity-50"
            >
              <option value="">{t("questions.form.optional")}</option>
              <For each={availableSubstandards()}>
                {(sub) => (
                  <option value={sub.id}>
                    {sub.code} - {getLocalized(sub.description, locale(), sub.code).slice(0, 40)}...
                  </option>
                )}
              </For>
            </select>
          </div>

          {/* Question Type */}
          <div>
            <label class="block font-semibold text-ink mb-1">{t("questions.form.type")}:</label>
            <select
              value={questionType()}
              onChange={(e) =>
                setQuestionType(
                  e.currentTarget.value as
                    | "single_choice"
                    | "multiple_choice"
                    | "true_false"
                    | "numeric",
                )
              }
              class="w-full rounded-xl border border-line bg-white p-2 text-xs"
            >
              <option value="single_choice">{t("questions.type.singleChoice")}</option>
              <option value="multiple_choice">{t("questions.type.multipleChoice")}</option>
              <option value="true_false">{t("questions.type.trueFalse")}</option>
              <option value="numeric">{t("questions.type.numeric")}</option>
            </select>
          </div>

          {/* Difficulty */}
          <div>
            <label class="block font-semibold text-ink mb-1">{t("questions.form.difficulty")}:</label>
            <select
              value={difficulty()}
              onChange={(e) =>
                  setDifficulty(e.currentTarget.value as "easy" | "medium" | "hard")
              }
              class="w-full rounded-xl border border-line bg-white p-2 text-xs"
            >
              <option value="easy">{t("questions.difficulty.easy")}</option>
              <option value="medium">{t("questions.difficulty.medium")}</option>
              <option value="hard">{t("questions.difficulty.hard")}</option>
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
              <label class="block font-semibold text-ink mb-1">{t("aiForm.quantity", { max: 25 })}:</label>
              <input
                type="number"
                min="1"
                max="25"
                value={quantity()}
                onInput={(e) => setQuantity(parseInt(e.currentTarget.value, 10) || 1)}
                class="w-full rounded-xl border border-line bg-white p-2 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Generate Action Button */}
        <div class="flex justify-between items-center">
          <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={isGenerating() || !standardId()}
          >
            <Show when={isGenerating()} fallback={<Icon name="refresh" class="size-4" />}>
              <Icon name="refresh" class="size-4 animate-spin" />
            </Show>
            <span>
              {isGenerating() ? t("aiForm.generatingQuestions") : t("aiForm.generateQuestions")}
            </span>
          </Button>

          <Show when={previewItems().length > 0}>
            <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
              {t("aiForm.questionsReady", { count: previewItems().length })}
            </span>
          </Show>
        </div>

        {/* Error notification */}
        <Show when={errorMessage()}>
          <p class="rounded-xl bg-danger-soft p-3 text-xs font-semibold text-danger">
            {errorMessage()}
          </p>
        </Show>

        {/* Preview of Generated Questions */}
        <Show when={previewItems().length > 0}>
          <div class="space-y-4 pt-4 border-t border-line">
            <h4 class="font-bold text-ink text-sm">
              {t("questions.aiGenerate.previewTitle")}
            </h4>

            <div class="space-y-3">
              <For each={previewItems()}>
                {(item, idx) => (
                  <div class="rounded-xl border border-line bg-white p-4 shadow-sm space-y-2 text-xs">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="rounded bg-brand-soft px-2 py-0.5 font-mono text-[10px] font-bold text-brand-strong">
                          {t(questionTypeKeys[item.question_type])}
                        </span>
                        <span class="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 font-semibold">
                          {t(difficultyKeys[item.difficulty as keyof typeof difficultyKeys] || "questions.difficulty.medium")}
                        </span>
                        <span class="font-mono text-[10px] text-ink-muted">
                          {item.standard_id}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePreviewItem(idx())}
                        class="text-ink-muted hover:text-danger"
                        title={t("aiForm.discardQuestion")}
                      >
                        <Icon name="trash" class="size-4" />
                      </button>
                    </div>

                    <div>
                      <label class="block font-medium text-ink-muted mb-0.5">{t("questions.form.prompt")}:</label>
                      <textarea
                        rows={2}
                        value={item.prompt}
                        onInput={(e) => handleUpdateItemPrompt(idx(), e.currentTarget.value)}
                        class="w-full rounded-lg border border-line p-2 text-xs"
                      />
                    </div>

                    {/* Choices */}
                    <Show when={item.options && item.options.length > 0}>
                      <div class="space-y-1">
                        <span class="font-medium text-ink-muted">{t("questions.form.options")}:</span>
                        <For each={item.options}>
                          {(opt) => (
                            <div
                              class={`flex items-center gap-2 rounded px-2 py-1 ${
                                opt.is_correct
                                  ? "bg-emerald-50 text-emerald-800 font-semibold"
                                  : "text-ink-muted"
                              }`}
                            >
                              <span class="w-5 text-center font-mono">{opt.option_key}.</span>
                              <span class="flex-1">{opt.content}</span>
                              <Show when={opt.is_correct}>
                                <Icon name="check" class="size-3.5 text-emerald-600" />
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>

                    {/* Numeric Answer */}
                    <Show when={item.question_type === "numeric" && item.answer_config}>
                      <div class="rounded bg-slate-50 p-2 font-mono text-xs">
                        {t("questions.form.numericAnswer")}: {String(item.answer_config?.correct_value)}
                      </div>
                    </Show>

                    {/* Explanation */}
                    <Show when={item.explanation}>
                      <p class="text-ink-muted italic">
                        {t("questions.form.explanation")}: {item.explanation}
                      </p>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>

      <div class="mt-6 flex justify-end gap-3 pt-4 border-t border-line">
        <Button variant="secondary" onClick={props.onClose} disabled={isSaving()}>
          {t("common.cancel")}
        </Button>
        <Show when={previewItems().length > 0}>
          <Button
            variant="primary"
            onClick={handleSaveToBank}
            disabled={isSaving() || previewItems().length === 0}
          >
            <Show when={isSaving()} fallback={<Icon name="check" class="size-4" />}>
              <Icon name="refresh" class="size-4 animate-spin" />
            </Show>
            <span>
              {isSaving()
                ? t("common.loading")
                : t("questions.aiGenerate.saveConfirm")}
            </span>
          </Button>
        </Show>
      </div>
    </Modal>
  );
};
