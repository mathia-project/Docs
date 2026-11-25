import { useNavigate, useParams, useSearchParams } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, onCleanup, Show, type Component } from "solid-js";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { useI18n } from "../lib/i18n";
import {
  testExecutionService,
  type AttemptReportBreakdown,
  type StudentQuestionView,
} from "../services/test-execution";
import { testAssignmentService } from "../services/test-assignments";
import { studentService } from "../services/student";

export const StudentTestPlayerPage: Component = () => {
  const { t } = useI18n();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [selectedAnswers, setSelectedAnswers] = createSignal<Record<string, Record<string, unknown>>>({});
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [reportResult, setReportResult] = createSignal<AttemptReportBreakdown | null>(null);
  const [isCompletedNotice, setIsCompletedNotice] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  // Timing tracking
  let questionStartTime = Date.now();

  const [attemptData] = createResource(
    () => params.assignmentId,
    async (assignmentId) => {
      if (!assignmentId) return null;
      try {
        const profile = await studentService.getProfile();
        if (!profile) throw new Error(t("student.tests.profileNotFound"));

        // Check existing attempts
        const studentAttempts = await testExecutionService.getStudentAttempts(profile.id, assignmentId);
        const activeAttempt = studentAttempts.find((a) => a.status === "in_progress");

        // Check max attempts allowed
        const assignment = await testAssignmentService.getAssignment(assignmentId);
        const versionRec = assignment?.test_version_id as any;
        const allowedAttempts = assignment?.max_attempts_override || versionRec?.max_attempts || 1;

        const isReviewRequested = searchParams.action === "review";
        const isMaxReached = !activeAttempt && studentAttempts.length >= allowedAttempts && studentAttempts.length > 0;

        // If user wants to review or if max attempts has been reached without an active attempt:
        if ((isReviewRequested || isMaxReached) && studentAttempts.length > 0) {
          const latestAttempt = studentAttempts[0];
          if (latestAttempt && (latestAttempt.status === "graded" || latestAttempt.status === "submitted")) {
            const report = await testExecutionService.getAttemptReport(latestAttempt.id);
            setReportResult(report);
            if (isMaxReached) {
              setIsCompletedNotice(true);
            }
            return null;
          }
        }

        const view = await testExecutionService.startAttempt(assignmentId, profile.id);

        // Populate existing answers
        const ansMap: Record<string, Record<string, unknown>> = {};
        for (const q of view.questions) {
          if (q.current_answer) {
            ansMap[q.attempt_question_id] = q.current_answer;
          }
        }
        setSelectedAnswers(ansMap);

        return view;
      } catch (err: any) {
        console.error("Failed to load test attempt:", err);
        setError(err?.message || "Failed to load test attempt");
        return null;
      }
    },
  );

  const questions = createMemo(() => attemptData()?.questions || []);
  const currentQuestion = createMemo<StudentQuestionView | null>(() => {
    const list = questions();
    return list[currentIndex()] || null;
  });

  const recordTimeOnCurrent = async () => {
    const q = currentQuestion();
    if (!q) return;
    const now = Date.now();
    const deltaMs = now - questionStartTime;
    questionStartTime = now;
    if (deltaMs > 500) {
      await testExecutionService.recordQuestionTiming(q.attempt_question_id, deltaMs);
    }
  };

  const handleSelectOption = async (optionKey: string) => {
    const initialQ = currentQuestion();
    if (!initialQ) return;

    let payload: Record<string, unknown>;
    if (initialQ.question_type === "multiple_choice") {
      const current = (selectedAnswers()[initialQ.attempt_question_id]?.selected_option_keys as string[]) || [];
      const updated = current.includes(optionKey)
        ? current.filter((k) => k !== optionKey)
        : [...current, optionKey];
      payload = { selected_option_keys: updated };
    } else {
      payload = { selected_option_key: optionKey };
    }

    setSelectedAnswers((prev) => ({
      ...prev,
      [initialQ.attempt_question_id]: payload,
    }));

    await testExecutionService.saveAnswer(initialQ.attempt_question_id, payload);
  };

  const handleNumericInput = async (val: number) => {
    const initialQ = currentQuestion();
    if (!initialQ) return;
    const payload = { numeric_value: val };
    setSelectedAnswers((prev) => ({
      ...prev,
      [initialQ.attempt_question_id]: payload,
    }));

    await testExecutionService.saveAnswer(initialQ.attempt_question_id, payload);
  };

  const goToNext = async () => {
    await recordTimeOnCurrent();
    if (currentIndex() < questions().length - 1) {
      setCurrentIndex((prev) => prev + 1);
      questionStartTime = Date.now();
    }
  };

  const goToPrev = async () => {
    await recordTimeOnCurrent();
    if (currentIndex() > 0) {
      setCurrentIndex((prev) => prev - 1);
      questionStartTime = Date.now();
    }
  };

  const handleSubmitAttempt = async () => {
    const attempt = attemptData();
    if (!attempt) return;

    if (!confirm(t("tests.player.confirmSubmit"))) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await recordTimeOnCurrent();
      const report = await testExecutionService.submitAttempt(attempt.attempt_id);
      setReportResult(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  onCleanup(() => {
    void recordTimeOnCurrent();
  });

  return (
    <div class="mx-auto max-w-4xl py-6 px-4">
      {/* Loading state */}
      <Show when={attemptData.loading}>
        <div class="flex items-center justify-center p-24 text-sm text-ink-muted">
          {t("app.loading")}
        </div>
      </Show>

      {/* Error state */}
      <Show when={attemptData.error || error()}>
        <div class="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
          <p class="font-bold">{t("common.error")}</p>
          <p class="mt-1">{attemptData.error?.message || error()}</p>
          <Button class="mt-4" variant="secondary" onClick={() => navigate("/student")}>
            {t("tests.player.returnToDashboard")}
          </Button>
        </div>
      </Show>

      {/* Graded Result View */}
      <Show when={reportResult()}>
        {(report) => (
          <div class="rounded-2xl border border-line bg-white p-8 shadow-card text-center space-y-6">
            <Show when={isCompletedNotice()}>
              <div class="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800 font-medium mx-auto">
                <Icon name="check" class="size-4 text-blue-600" />
                {t("student.tests.maxAttemptsNotice")}
              </div>
            </Show>

            <span class="inline-grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 mx-auto">
              <Icon name="check" class="size-8" />
            </span>

            <div>
              <h2 class="text-2xl font-bold text-ink">{t("tests.player.completed")}</h2>
              <p class="text-sm text-ink-muted mt-1">
                {t("tests.player.score")}: {report().total_score} / {report().max_score} ({report().score_percent}%)
              </p>
            </div>

            {/* Score gauge / cards */}
            <div class="grid grid-cols-3 gap-4 pt-4 border-t border-line text-left">
              <div class="rounded-xl border border-line p-4 bg-canvas">
                <span class="block text-xs font-semibold text-ink-muted">{t("tests.player.score")}</span>
                <span class="mt-1 text-2xl font-bold text-ink">{report().total_score} / {report().max_score}</span>
              </div>
              <div class="rounded-xl border border-line p-4 bg-canvas">
                <span class="block text-xs font-semibold text-ink-muted">{t("tests.player.accuracy")}</span>
                <span class="mt-1 text-2xl font-bold text-emerald-600">{report().score_percent}%</span>
              </div>
              <div class="rounded-xl border border-line p-4 bg-canvas">
                <span class="block text-xs font-semibold text-ink-muted">{t("tests.player.duration")}</span>
                <span class="mt-1 text-2xl font-bold text-ink">
                  {Math.round(report().total_active_duration_ms / 1000)}s
                </span>
              </div>
            </div>

            {/* Domain Breakdown */}
            <div class="text-left pt-4 border-t border-line">
              <h3 class="text-sm font-bold text-ink">{t("tests.player.domainBreakdown")}</h3>
              <div class="mt-3 space-y-3">
                <For each={Object.values(report().by_domain)}>
                  {(domain) => (
                    <div>
                      <div class="flex justify-between text-xs font-medium text-ink">
                        <span>{domain.domain_id}</span>
                        <span>{domain.accuracy_percent}% ({domain.score}/{domain.max_score} pts)</span>
                      </div>
                      <div class="mt-1.5 h-2 w-full rounded-full bg-canvas overflow-hidden">
                        <div
                          class="h-full bg-brand transition-all duration-500"
                          style={{ width: `${domain.accuracy_percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <div class="pt-6">
              <Button onClick={() => navigate("/student")}>
                {t("tests.player.returnToDashboard")}
              </Button>
            </div>
          </div>
        )}
      </Show>

      {/* Active Test Taking Player */}
      <Show when={attemptData() && !reportResult() && currentQuestion()}>
        {(q) => {
          const currentAns = () => selectedAnswers()[q().attempt_question_id];
          const isCurrentSelected = (key: string) => {
            const ans = currentAns();
            if (!ans) return false;
            if (q().question_type === "multiple_choice") {
              return ((ans.selected_option_keys as string[]) || []).includes(key);
            }
            return ans.selected_option_key === key;
          };

          return (
            <div class="space-y-6">
              {/* Header bar */}
              <div class="flex items-center justify-between rounded-2xl border border-line bg-white px-6 py-4 shadow-card">
                <div>
                  <span class="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {t("tests.player.question")} {currentIndex() + 1} {t("tests.player.of")} {questions().length}
                  </span>
                  <div class="mt-1 flex items-center gap-2">
                    <span class="rounded bg-canvas px-2 py-0.5 text-xs font-medium text-ink-muted uppercase">
                      {q().difficulty}
                    </span>
                    <span class="rounded bg-canvas px-2 py-0.5 text-xs font-medium text-ink-muted uppercase">
                      {q().question_type.replace("_", " ")}
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <Button
                    variant="secondary"
                    class="!text-xs !py-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
                    disabled={isSubmitting()}
                    onClick={handleSubmitAttempt}
                  >
                    <Icon name="check" class="mr-1.5 size-3.5" />
                    {isSubmitting() ? t("common.saving") : t("tests.player.submit")}
                  </Button>
                </div>
              </div>

              {/* Question Content Box */}
              <div class="rounded-2xl border border-line bg-white p-6 sm:p-8 shadow-card space-y-6">
                <p class="text-lg font-medium text-ink whitespace-pre-wrap">{q().prompt}</p>

                {/* Multiple/Single Choice / True-False Options */}
                <Show when={q().options && q().options.length > 0}>
                  <div class="space-y-3 pt-2">
                    <For each={q().options}>
                      {(opt) => {
                        const selected = () => isCurrentSelected(opt.option_key);
                        return (
                          <button
                            type="button"
                            onClick={() => handleSelectOption(opt.option_key)}
                            class={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all ${
                              selected()
                                ? "border-brand bg-brand-soft/30 text-ink ring-2 ring-brand/20"
                                : "border-line bg-canvas/30 text-ink hover:border-brand/40 hover:bg-canvas"
                            }`}
                          >
                            <span
                              class={`grid size-7 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold transition-colors ${
                                selected()
                                  ? "bg-brand text-white"
                                  : "border border-line bg-white text-ink-muted"
                              }`}
                            >
                              {opt.option_key}
                            </span>
                            <span class="text-sm font-medium pt-0.5">{opt.content}</span>
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>

                {/* Numeric Input */}
                <Show when={q().question_type === "numeric"}>
                  <div class="pt-2 max-w-xs">
                    <label class="block text-xs font-bold text-ink mb-1.5">{t("student.tests.numericAnswer")}</label>
                    <input
                      type="number"
                      step="any"
                      value={(currentAns()?.numeric_value as number) ?? ""}
                      onInput={(e) => handleNumericInput(Number(e.currentTarget.value))}
                      placeholder="42.5"
                      class="w-full rounded-xl border border-line px-4 py-2.5 text-base font-medium text-ink outline-none focus:border-brand"
                    />
                  </div>
                </Show>
              </div>

              {/* Navigation Palette and Previous / Next Buttons */}
              <div class="flex items-center justify-between pt-2">
                <Button
                  variant="secondary"
                  disabled={currentIndex() === 0}
                  onClick={goToPrev}
                >
                  <Icon name="chevron-right" class="mr-1.5 size-4 rotate-180" />
                  {t("tests.player.previous")}
                </Button>

                {/* Question palette */}
                <div class="flex flex-wrap gap-1.5 justify-center max-w-md">
                  <For each={questions()}>
                    {(item, idx) => {
                      const answered = () => Boolean(selectedAnswers()[item.attempt_question_id]);
                      const isCurrent = () => idx() === currentIndex();
                      return (
                        <button
                          type="button"
                          onClick={async () => {
                            await recordTimeOnCurrent();
                            setCurrentIndex(idx());
                            questionStartTime = Date.now();
                          }}
                          class={`size-8 rounded-lg text-xs font-bold transition-all ${
                            isCurrent()
                              ? "bg-brand text-white ring-2 ring-brand/30"
                              : answered()
                              ? "bg-brand-soft text-brand border border-brand/20"
                              : "border border-line bg-white text-ink-muted hover:bg-canvas"
                          }`}
                        >
                          {idx() + 1}
                        </button>
                      );
                    }}
                  </For>
                </div>

                <Show
                  when={currentIndex() < questions().length - 1}
                  fallback={
                    <Button onClick={handleSubmitAttempt} disabled={isSubmitting()}>
                      {isSubmitting() ? t("common.saving") : t("tests.player.submit")}
                    </Button>
                  }
                >
                  <Button onClick={goToNext}>
                    {t("tests.player.next")}
                    <Icon name="chevron-right" class="ml-1.5 size-4" />
                  </Button>
                </Show>
              </div>
            </div>
          );
        }}
      </Show>
    </div>
  );
};
