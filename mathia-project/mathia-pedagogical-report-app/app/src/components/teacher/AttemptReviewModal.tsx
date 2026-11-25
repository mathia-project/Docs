import { createResource, For, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useI18n } from "../../lib/i18n";
import { testExecutionService, type QuestionReviewItem } from "../../services/test-execution";

interface AttemptReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  attemptId: string | null;
  studentName?: string | undefined;
  testTitle?: string | undefined;
  attemptNumber?: number | undefined;
}

export const AttemptReviewModal: Component<AttemptReviewModalProps> = (props) => {
  const { t } = useI18n();

  const [report] = createResource(
    () => (props.isOpen && props.attemptId ? props.attemptId : null),
    (id) => testExecutionService.getAttemptReport(id),
  );

  const formatSeconds = (ms: number) => {
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("teacher.review.modalTitle")}
      maxWidth="3xl"
    >
      <div class="mt-4 flex flex-col gap-6">
        {/* Header Summary */}
        <div class="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-canvas p-4 text-sm">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {t("teacher.review.student")}
            </p>
            <p class="font-bold text-ink">{props.studentName || "-"}</p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              {t("teacher.review.test")}
            </p>
            <p class="font-bold text-ink">{props.testTitle || "-"}</p>
          </div>
          <Show when={props.attemptNumber}>
            <div>
              <p class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {t("student.tests.attempts")}
              </p>
              <p class="font-bold text-ink">#{props.attemptNumber}</p>
            </div>
          </Show>
          <Show when={report()}>
            {(rep) => (
              <>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    {t("tests.player.score")}
                  </p>
                  <p class="font-bold text-brand">
                    {rep().total_score} / {rep().max_score} ({rep().score_percent}%)
                  </p>
                </div>
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    {t("teacher.review.duration")}
                  </p>
                  <p class="font-bold text-ink">
                    {formatSeconds(rep().total_active_duration_ms)}
                  </p>
                </div>
              </>
            )}
          </Show>
        </div>

        {/* Loading / Content */}
        <Show
          when={!report.loading}
          fallback={
            <div class="flex items-center justify-center py-12 text-sm text-ink-muted">
              {t("common.loading")}
            </div>
          }
        >
          <Show when={report()}>
            {(rep) => (
              <div class="flex flex-col gap-6">
                {/* Domains Breakdown */}
                <Show when={Object.keys(rep().by_domain).length > 0}>
                  <div>
                    <h4 class="text-xs font-bold uppercase tracking-wider text-ink-muted">
                      {t("teacher.review.domains")}
                    </h4>
                    <div class="mt-2.5 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                      <For each={Object.values(rep().by_domain)}>
                        {(domain) => (
                          <div class="rounded-xl border border-line bg-white p-3 shadow-xs">
                            <div class="flex items-center justify-between text-xs">
                              <span class="font-bold uppercase tracking-wider text-ink">
                                {domain.domain_id}
                              </span>
                              <span class="font-semibold text-brand">
                                {domain.accuracy_percent}%
                              </span>
                            </div>
                            <div class="mt-2 flex items-center justify-between text-xs text-ink-muted">
                              <span>
                                {domain.correct_questions} / {domain.total_questions}{" "}
                                {t("tests.player.question").toLowerCase()}
                              </span>
                              <span>{formatSeconds(domain.average_duration_ms)}</span>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Questions Breakdown */}
                <div>
                  <h4 class="text-xs font-bold uppercase tracking-wider text-ink-muted">
                    {t("teacher.review.questions")}
                  </h4>
                  <div class="mt-3 flex flex-col gap-4">
                    <For each={rep().question_reviews || []}>
                      {(q: QuestionReviewItem, idx) => (
                        <div class="rounded-2xl border border-line bg-white p-5 shadow-xs">
                          {/* Top Question Bar */}
                          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                            <div class="flex items-center gap-2">
                              <span class="grid size-6 place-items-center rounded-full bg-brand-soft font-mono text-xs font-bold text-brand">
                                {idx() + 1}
                              </span>
                              <span class="text-sm font-semibold text-ink">
                                {t("teacher.review.questionNumber", { number: String(idx() + 1) })}
                              </span>
                              <Show when={q.standard_id}>
                                <span class="rounded bg-canvas px-2 py-0.5 font-mono text-xs text-ink-muted">
                                  {q.standard_id}
                                </span>
                              </Show>
                            </div>
                            <div class="flex items-center gap-3 text-xs">
                              <span class="text-ink-muted">
                                ⏱️ {(q.active_duration_ms / 1000).toFixed(1)}s
                              </span>
                              <span
                                class={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${
                                  q.is_correct
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-rose-50 text-rose-700"
                                }`}
                              >
                                {q.is_correct ? "✓ " : "✕ "}
                                {q.score_awarded} / {q.points} pts
                              </span>
                            </div>
                          </div>

                          {/* Statement */}
                          <div class="mt-3 text-sm font-medium leading-relaxed text-ink">
                            {q.prompt}
                          </div>

                          {/* Options / Answer */}
                          <Show when={q.options && q.options.length > 0}>
                            <div class="mt-3.5 flex flex-col gap-2">
                              <For each={q.options}>
                                {(opt: any) => {
                                  const optKey = opt.option_key || opt.id || opt.key;
                                  const studentSelected =
                                    q.student_answer?.selected_options &&
                                    Array.isArray(q.student_answer.selected_options)
                                      ? q.student_answer.selected_options.includes(optKey)
                                      : q.student_answer?.selected_option === optKey;
                                  const isOptionCorrect = !!opt.is_correct;

                                  let optClass = "border-line bg-white text-ink";
                                  let indicator = null;

                                  if (studentSelected && isOptionCorrect) {
                                    optClass =
                                      "border-emerald-300 bg-emerald-50/60 text-emerald-900 font-semibold";
                                    indicator = "✓";
                                  } else if (studentSelected && !isOptionCorrect) {
                                    optClass =
                                      "border-rose-300 bg-rose-50/60 text-rose-900 font-semibold";
                                    indicator = "✕";
                                  } else if (isOptionCorrect) {
                                    optClass =
                                      "border-emerald-200 bg-emerald-50/30 text-emerald-800";
                                    indicator = "✓";
                                  }

                                  return (
                                    <div
                                      class={`flex items-start justify-between rounded-xl border p-3 text-sm transition-colors ${optClass}`}
                                    >
                                      <div class="flex items-center gap-2.5">
                                        <span class="font-mono text-xs font-bold uppercase text-ink-muted">
                                          {optKey}:
                                        </span>
                                        <span>{opt.content || opt.text || opt.label}</span>
                                      </div>
                                      <div class="flex items-center gap-2 text-xs">
                                        <Show when={studentSelected}>
                                          <span class="rounded bg-white/80 px-2 py-0.5 font-medium shadow-2xs">
                                            {t("teacher.review.studentAnswer")}
                                          </span>
                                        </Show>
                                        <Show when={indicator}>
                                          <span class="font-bold">{indicator}</span>
                                        </Show>
                                      </div>
                                    </div>
                                  );
                                }}
                              </For>
                            </div>
                          </Show>

                          {/* If numeric or text question */}
                          <Show when={!q.options || q.options.length === 0}>
                            <div class="mt-3 rounded-xl border border-line bg-canvas p-3 text-xs">
                              <span class="font-semibold text-ink-muted">
                                {t("teacher.review.studentAnswer")}{" "}
                              </span>
                              <span class="font-mono font-bold text-ink">
                                {JSON.stringify(q.student_answer?.value ?? q.student_answer ?? "-")}
                              </span>
                            </div>
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </Show>

        {/* Footer */}
        <div class="flex justify-end border-t border-line pt-4">
          <Button variant="secondary" onClick={props.onClose}>
            {t("teacher.review.close")}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
