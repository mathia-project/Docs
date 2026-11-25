import { A, useParams } from "@solidjs/router";
import {
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
  type Component,
} from "solid-js";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Modal } from "../../components/ui/Modal";
import { useI18n } from "../../lib/i18n";
import { formatCourseLabel } from "../../lib/curriculum";
import {
  pedagogicalReportService,
  predictStudentSupport,
} from "../../services/pedagogical-report";
import { SavedStudentReports } from "../../components/reports/SavedStudentReports";
import {
  draftStudentReportProposal,
  ReportDocumentError,
  saveStudentReportProposal,
  type StudentReportGenerationProposal,
} from "../../services/report-document";

export const PedagogicalReportPage: Component = () => {
  const { t, locale } = useI18n();
  const params = useParams();

  const studentId = () => params.studentId || "";
  const classId = () => params.classId || "";

  const [isLlmModalOpen, setIsLlmModalOpen] = createSignal(false);
  const [isDraftSaving, setIsDraftSaving] = createSignal(false);
  const [isReportSaving, setIsReportSaving] = createSignal(false);
  const [generatedDraft, setGeneratedDraft] = createSignal<StudentReportGenerationProposal | null>(null);
  const [draftGenerationError, setDraftGenerationError] = createSignal<string | null>(null);
  const [draftSaveError, setDraftSaveError] = createSignal<string | null>(null);
  const [savedReportsRefreshKey, setSavedReportsRefreshKey] = createSignal(0);
  const [copiedPayload, setCopiedPayload] = createSignal(false);
  const [isPredictionRunning, setIsPredictionRunning] = createSignal(false);
  const [predictionError, setPredictionError] = createSignal<string | null>(null);

  // Fetch complete pedagogical report aggregation
  const [reportData, { refetch }] = createResource(
    () => ({ studentId: studentId(), classId: classId() }),
    async ({ studentId, classId }) => {
      if (!studentId) return null;
      return await pedagogicalReportService.getStudentReportData(studentId, classId);
    },
  );

  const backUrl = () => {
    if (classId()) {
      return `/teacher/classes/${classId()}`;
    }
    return "/director/students";
  };

  const handleOpenLlmModal = async () => {
    setIsLlmModalOpen(true);
    setGeneratedDraft(null);
    setDraftGenerationError(null);
    setDraftSaveError(null);
    if (reportData.error) return;
    const data = reportData();
    if (!data) return;

    try {
      setIsDraftSaving(true);
      const today = new Date();
      const end = today.toISOString().slice(0, 10);
      const startDate = new Date(today);
      startDate.setFullYear(startDate.getFullYear() - 1);

      const proposal = await draftStudentReportProposal({
        student_id: studentId(),
        class_id: classId() || data.student.class_id,
        period_start: startDate.toISOString().slice(0, 10),
        period_end: end,
        language: data.student.preferred_language === "en" || data.student.preferred_language === "it"
          ? data.student.preferred_language
          : "es",
      });
      setGeneratedDraft(proposal);
    } catch (err) {
      console.error("Failed to generate report draft:", err);
      setDraftGenerationError(
        err instanceof TypeError
          ? t("report.pedagogical.llmDraftConnectionError")
          : err instanceof Error ? err.message : t("common.error"),
      );
    } finally {
      setIsDraftSaving(false);
    }
  };

  const handleSaveGeneratedReport = async () => {
    const draft = generatedDraft();
    const data = reportData();
    if (!draft || !data || isReportSaving()) return;

    setDraftSaveError(null);
    setIsReportSaving(true);
    try {
      await saveStudentReportProposal({
        student_id: studentId(),
        class_id: classId() || data.student.class_id,
        document: draft.document,
        evidence_snapshot: draft.evidence,
        metadata: draft.metadata,
        content_origin: "generated",
      });
      setGeneratedDraft(null);
      setIsLlmModalOpen(false);
      setSavedReportsRefreshKey((value) => value + 1);
    } catch (err) {
      console.error("Failed to save generated report:", err);
      if (err instanceof ReportDocumentError) {
        setDraftSaveError(t(`report.document.error.${err.code}`));
      } else {
        setDraftSaveError(err instanceof Error ? err.message : t("common.error"));
      }
    } finally {
      setIsReportSaving(false);
    }
  };

  const handleRunPrediction = async () => {
    if (!studentId() || isPredictionRunning()) return;
    setPredictionError(null);
    setIsPredictionRunning(true);
    try {
      await predictStudentSupport(studentId());
      await refetch();
    } catch (error) {
      setPredictionError(error instanceof Error ? error.message : t("common.error"));
    } finally {
      setIsPredictionRunning(false);
    }
  };

  const handleCopyJson = () => {
    if (reportData.error) return;
    const data = reportData();
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2500);
  };

  return (
    <div class="space-y-6 pb-12">
      {/* Top Navigation & Action Header */}
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <A
            href={backUrl()}
            class="grid size-10 place-items-center rounded-2xl border border-line bg-white text-ink-muted transition hover:border-brand hover:text-brand"
            aria-label={t("common.back")}
          >
            <Icon name="arrow-left" class="size-4" />
          </A>
          <div>
            <p class="text-xs font-semibold tracking-wide text-brand uppercase">
              {t("report.pedagogical.eyebrow")}
            </p>
            <h1 class="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {t("report.pedagogical.title")}
            </h1>
          </div>
        </div>

        <div class="flex items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={handleRunPrediction}
            disabled={reportData.loading || isPredictionRunning() || !studentId()}
          >
            <Icon name="report" class="size-4" />
            <span>
              {isPredictionRunning()
                ? t("report.pedagogical.runningPrediction")
                : t("report.pedagogical.runPrediction")}
            </span>
          </Button>
          <Button
            type="button"
            onClick={handleOpenLlmModal}
            disabled={reportData.loading || Boolean(reportData.error) || !reportData()}
            class="shadow-md shadow-brand/15"
          >
            <Icon name="report" class="size-4" />
            <span>{t("report.pedagogical.llmDraftButton")}</span>
          </Button>
        </div>
      </div>

      <Show when={predictionError()}>
        {(message) => (
          <p class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">
            {message()}
          </p>
        )}
      </Show>

      <SavedStudentReports
        studentId={studentId()}
        classId={classId()}
        refreshKey={savedReportsRefreshKey()}
      />

      {/* Loading state */}
      <Show when={reportData.loading}>
        <div class="rounded-3xl border border-line bg-white p-12 text-center shadow-card">
          <div class="inline-block size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <p class="mt-3 text-sm text-ink-muted">{t("common.loading")}</p>
        </div>
      </Show>

      {/* Error state */}
      <Show when={!reportData.loading && (Boolean(reportData.error) || !reportData())}>
        <div class="rounded-3xl border border-line bg-white p-12 text-center shadow-card">
          <p class="text-sm text-danger">{t("common.error")}</p>
          <Button variant="secondary" class="mt-4" onClick={() => refetch()}>
            {t("common.retry")}
          </Button>
        </div>
      </Show>

      {/* Main Report Content */}
      <Show when={!reportData.loading && !reportData.error && reportData()}>
        {(data) => {
          const student = () => data().student;
          const diagnostic = () => data().diagnostic;
          const metrics = () => data().metrics;

          return (
            <div class="space-y-6">
              {/* Student Summary Hero Card */}
              <div class="rounded-3xl border border-line bg-white p-6 shadow-card sm:p-7">
                <div class="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div class="flex items-center gap-4">
                    <span class="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-soft text-lg font-bold text-brand">
                      {student().first_name?.[0] || ""}
                      {student().last_name?.[0] || ""}
                    </span>
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h2 class="text-xl font-bold text-ink">
                          {student().first_name} {student().last_name}
                        </h2>
                      </div>
                      <div class="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                        <Show when={student().external_id}>
                          <span class="font-mono font-semibold text-ink">
                            ID: {student().external_id}
                          </span>
                          <span>•</span>
                        </Show>
                        <Show when={student().class_name}>
                          <span class="font-medium text-ink">
                            {t("report.pedagogical.classLabel")} {student().class_name}
                          </span>
                          <span>•</span>
                        </Show>
                        <Show when={student().grade_level}>
                          <span>{t("report.pedagogical.gradeLabel")} {formatCourseLabel(student().grade_level, locale())}</span>
                        </Show>
                      </div>
                    </div>
                  </div>

                  {/* Student Attributes Badges */}
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="rounded-xl border border-line bg-canvas px-3 py-1 text-xs font-semibold uppercase text-ink-muted">
                      {student().preferred_language || "es"}
                    </span>
                  </div>
                </div>

                {/* Diagnostic Status Card */}
                <div class="mt-6">
                  <Switch>
                    {/* Case 1: Student has confirmed diagnosis */}
                    <Match when={diagnostic().has_diagnosis}>
                      <div class="rounded-2xl border border-purple-200 bg-purple-50/70 p-4 sm:p-5">
                        <div class="flex items-start gap-3.5">
                          <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-purple-600 text-white">
                            <Icon name="check" class="size-4" />
                          </div>
                          <div class="flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                              <h3 class="text-sm font-bold text-purple-950">
                                {t("report.pedagogical.diagnosticPresent")}
                              </h3>
                              <span class="rounded-full bg-purple-200/80 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                                {t("director.students.diagnosisActive")}
                              </span>
                            </div>
                            <Show
                              when={diagnostic().diagnosis_notes}
                              fallback={
                                <p class="mt-1 text-xs text-purple-800">
                                  {t("director.students.hasDiagnosisHelp")}
                                </p>
                              }
                            >
                              <div class="mt-2 rounded-xl border border-purple-200/60 bg-white/80 p-3 text-xs text-purple-900">
                                <span class="font-bold">{t("report.pedagogical.observations")} </span>
                                {diagnostic().diagnosis_notes}
                              </div>
                            </Show>
                            <p class="mt-2 text-[11px] text-purple-700">
                              ℹ️ {t("report.pedagogical.officialFollowUp")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Match>

                    {/* Case 2: No prediction has been manually requested yet */}
                    <Match when={!diagnostic().has_diagnosis && !diagnostic().support_prediction}>
                      <div class="rounded-2xl border border-line bg-canvas-soft/80 p-4">
                        <div class="flex items-start gap-3.5">
                          <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-600 text-white">
                            <Icon name="report" class="size-4" />
                          </div>
                          <div>
                            <h3 class="text-sm font-bold text-ink">
                              {t("report.pedagogical.predictionNotRequested")}
                            </h3>
                            <p class="mt-0.5 text-xs text-ink-muted">
                              {t("report.pedagogical.predictionNotRequestedHelp")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Match>

                    {/* Case 3: Student has NO diagnosis, but AI suggests evaluation */}
                    <Match when={!diagnostic().has_diagnosis && diagnostic().needs_evaluation}>
                      <div class="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 sm:p-5">
                        <div class="flex items-start gap-3.5">
                          <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-600 text-white">
                            <Icon name="report" class="size-4" />
                          </div>
                          <div class="flex-1">
                            <div class="flex flex-wrap items-center gap-2">
                              <h3 class="text-sm font-bold text-amber-950">
                                {t("report.pedagogical.aiEvaluationSuggested")}
                              </h3>
                              <span class="rounded-full bg-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                                {t("director.students.evaluationAlert")}
                              </span>
                            </div>
                            <p class="mt-1.5 text-xs text-amber-900 leading-relaxed">
                              {diagnostic().evaluation_suggestion_detail || t("report.pedagogical.evaluationDetailFallback")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Match>

                    {/* Case 4: The model cannot make a decision */}
                    <Match
                      when={
                        !diagnostic().has_diagnosis &&
                        diagnostic().support_prediction?.status === "insufficient_information"
                      }
                    >
                      <div class="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
                        <div class="flex items-start gap-3.5">
                          <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-700 text-white">
                            <Icon name="report" class="size-4" />
                          </div>
                          <div>
                            <h3 class="text-sm font-bold text-sky-950">
                              {t("report.pedagogical.aiInformationInsufficient")}
                            </h3>
                            <p class="mt-0.5 text-xs text-sky-900">
                              {diagnostic().evaluation_suggestion_detail}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Match>

                    {/* Case 5: Student has NO diagnosis and no model signal */}
                    <Match
                      when={
                        !diagnostic().has_diagnosis &&
                        diagnostic().support_prediction?.status === "no_support_signal"
                      }
                    >
                      <div class="rounded-2xl border border-line bg-canvas-soft/80 p-4">
                        <div class="flex items-start gap-3.5">
                          <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-600 text-white">
                            <Icon name="check" class="size-4" />
                          </div>
                          <div>
                            <h3 class="text-sm font-bold text-ink">
                              {t("report.pedagogical.diagnosticNone")}
                            </h3>
                            <p class="mt-0.5 text-xs text-ink-muted">
                              {diagnostic().evaluation_suggestion_detail ||
                                t("report.pedagogical.aiEvaluationNotSuggested")}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Match>
                  </Switch>
                </div>
              </div>

              {/* 4 Academic Metrics Overview */}
              <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div class="rounded-2xl border border-line bg-white p-4 shadow-card">
                  <span class="text-xs font-semibold text-ink-muted">
                    {t("report.pedagogical.metrics.average")}
                  </span>
                  <div class="mt-1 flex items-baseline gap-1.5">
                    <span class="text-2xl font-bold text-ink sm:text-3xl">
                      {metrics().curriculum_average}
                    </span>
                    <span class="text-xs font-bold text-ink-muted">/ 15</span>
                  </div>
                  <span class="mt-1 block text-xs font-semibold text-brand">
                    {metrics().curriculum_average_percent}% {t("report.pedagogical.metrics.overall")}
                  </span>
                </div>

                <div class="rounded-2xl border border-line bg-white p-4 shadow-card">
                  <span class="text-xs font-semibold text-ink-muted">
                    {t("report.pedagogical.metrics.tests")}
                  </span>
                  <div class="mt-1">
                    <span class="text-2xl font-bold text-ink sm:text-3xl">
                      {metrics().tests_completed}
                    </span>
                  </div>
                  <span class="mt-1 block text-xs text-ink-muted">
                    {t("report.pedagogical.metrics.testsHelp")}
                  </span>
                </div>

                <div class="rounded-2xl border border-line bg-white p-4 shadow-card">
                  <span class="text-xs font-semibold text-ink-muted">
                    {t("report.pedagogical.metrics.accuracy")}
                  </span>
                  <div class="mt-1">
                    <span class="text-2xl font-bold text-ink sm:text-3xl">
                      {metrics().overall_accuracy_percent}%
                    </span>
                  </div>
                  <span class="mt-1 block text-xs text-ink-muted">
                    {t("report.pedagogical.metrics.accuracyHelp")}
                  </span>
                </div>

                <div class="rounded-2xl border border-line bg-white p-4 shadow-card">
                  <span class="text-xs font-semibold text-ink-muted">
                    {t("report.pedagogical.metrics.domains")}
                  </span>
                  <div class="mt-1">
                    <span class="text-2xl font-bold text-ink sm:text-3xl">
                      {metrics().total_evaluated_domains}
                    </span>
                  </div>
                  <span class="mt-1 block text-xs text-ink-muted">
                    {t("report.pedagogical.metrics.domainsHelp")}
                  </span>
                </div>
              </div>

              {/* Domain Mastery Breakdown Bar Scale (0 - 15) */}
              <div class="rounded-3xl border border-line bg-white p-6 shadow-card">
                <div class="flex items-center justify-between border-b border-line pb-4">
                  <div>
                    <h3 class="text-sm font-bold uppercase tracking-wider text-ink">
                      {t("report.pedagogical.domainAssessmentTitle")}
                    </h3>
                    <p class="mt-0.5 text-xs text-ink-muted">
                      {t("report.pedagogical.domainAssessmentHelp")}
                    </p>
                  </div>
                  <div class="hidden items-center gap-3 text-xs sm:flex">
                    <span class="flex items-center gap-1.5 text-rose-700">
                      <span class="size-2.5 rounded-full bg-rose-500" />
                      {t("report.pedagogical.scaleCritical")}
                    </span>
                    <span class="flex items-center gap-1.5 text-amber-700">
                      <span class="size-2.5 rounded-full bg-amber-500" />
                      {t("report.pedagogical.scalePractice")}
                    </span>
                    <span class="flex items-center gap-1.5 text-emerald-700">
                      <span class="size-2.5 rounded-full bg-emerald-500" />
                      {t("report.pedagogical.scaleMastered")}
                    </span>
                  </div>
                </div>

                <Show
                  when={data().domains.length > 0}
                  fallback={
                    <p class="py-8 text-center text-xs italic text-ink-muted">
                      {t("report.pedagogical.noDomainEvaluations")}
                    </p>
                  }
                >
                  <div class="mt-5 space-y-4">
                    <For each={data().domains}>
                      {(d) => {
                        const percentOf15 = () =>
                          Math.min(100, Math.round((d.score / 15) * 100));

                        return (
                          <div>
                            <div class="flex items-center justify-between text-xs">
                              <span class="font-bold text-ink">{d.domain_name}</span>
                              <div class="flex items-center gap-2">
                                <span class="font-mono font-bold text-ink">
                                  {d.score} / 15
                                </span>
                                <span
                                  class={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                                    d.score < 5
                                      ? "bg-rose-100 text-rose-800"
                                      : d.score < 10
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  {d.score < 5
                                    ? t("report.pedagogical.urgentLabel")
                                    : d.score < 10
                                      ? t("report.pedagogical.practiceLabel")
                                      : t("report.pedagogical.masteredLabel")}
                                </span>
                              </div>
                            </div>
                            {/* Bar container */}
                            <div class="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-canvas-soft">
                              <div
                                class={`h-full rounded-full transition-all duration-500 ${
                                  d.score < 5
                                    ? "bg-rose-500"
                                    : d.score < 10
                                      ? "bg-amber-500"
                                      : "bg-emerald-500"
                                }`}
                                style={{ width: `${percentOf15()}%` }}
                              />
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>

              {/* Two Column Grid: Strengths & Weaknesses (Left) + Recommended Resources (Right) */}
              <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* Left Column: Strengths & Weaknesses */}
                <div class="space-y-6">
                  {/* Strengths Card */}
                  <div class="rounded-3xl border border-line bg-white p-6 shadow-card">
                    <div class="flex items-center gap-2.5 border-b border-line pb-4">
                      <div class="grid size-8 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                        <Icon name="check" class="size-4" />
                      </div>
                      <div>
                        <h3 class="text-sm font-bold text-ink">
                          {t("report.pedagogical.strengths.title")}
                        </h3>
                        <p class="text-xs text-ink-muted">
                          {t("report.pedagogical.strengths.description")}
                        </p>
                      </div>
                    </div>

                    <div class="mt-4 space-y-3">
                      <Show
                        when={data().strengths.length > 0}
                        fallback={
                          <p class="py-4 text-center text-xs italic text-ink-muted">
                            {t("report.pedagogical.strengths.empty")}
                          </p>
                        }
                      >
                        <For each={data().strengths}>
                          {(str) => (
                            <div class="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3.5">
                              <div class="flex items-center justify-between">
                                <h4 class="text-xs font-bold text-emerald-950">
                                  {str.domain_name}
                                </h4>
                                <span class="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                                  {str.score} / 15
                                </span>
                              </div>
                              <p class="mt-1 text-xs text-emerald-800">
                                {t("report.pedagogical.strengthsDetail")}
                              </p>
                            </div>
                          )}
                        </For>
                      </Show>
                    </div>
                  </div>

                  {/* Weaknesses Card */}
                  <div class="rounded-3xl border border-line bg-white p-6 shadow-card">
                    <div class="flex items-center gap-2.5 border-b border-line pb-4">
                      <div class="grid size-8 place-items-center rounded-xl bg-rose-100 text-rose-700">
                        <Icon name="report" class="size-4" />
                      </div>
                      <div>
                        <h3 class="text-sm font-bold text-ink">
                          {t("report.pedagogical.weaknesses.title")}
                        </h3>
                        <p class="text-xs text-ink-muted">
                          {t("report.pedagogical.weaknesses.description")}
                        </p>
                      </div>
                    </div>

                    <div class="mt-4 space-y-3">
                      <Show
                        when={data().weaknesses.length > 0}
                        fallback={
                          <p class="py-4 text-center text-xs italic text-ink-muted">
                            {t("report.pedagogical.weaknesses.empty")}
                          </p>
                        }
                      >
                        <For each={data().weaknesses}>
                          {(wk) => {
                            const isUrgent = () => wk.score < 5;

                            return (
                              <div
                                class={`rounded-2xl border p-3.5 ${
                                  isUrgent()
                                    ? "border-rose-200 bg-rose-50/60"
                                    : "border-amber-200 bg-amber-50/50"
                                }`}
                              >
                                <div class="flex items-center justify-between">
                                  <h4
                                    class={`text-xs font-bold ${
                                      isUrgent() ? "text-rose-950" : "text-amber-950"
                                    }`}
                                  >
                                    {wk.domain_name}
                                  </h4>
                                  <span
                                    class={`rounded-lg px-2 py-0.5 text-xs font-bold ${
                                      isUrgent()
                                        ? "bg-rose-200 text-rose-900"
                                        : "bg-amber-200 text-amber-900"
                                    }`}
                                  >
                                    {wk.score} / 15
                                  </span>
                                </div>
                                <div class="mt-2 flex items-center gap-2">
                                  <span
                                    class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                      isUrgent()
                                        ? "bg-rose-600 text-white"
                                        : "bg-amber-600 text-white"
                                    }`}
                                  >
                                    {isUrgent()
                                      ? t("report.pedagogical.priority.urgent")
                                      : t("report.pedagogical.priority.practice")}
                                  </span>
                                  <span class="text-[11px] text-ink-muted">
                                    {isUrgent()
                                      ? t("report.pedagogical.urgentHelp")
                                      : t("report.pedagogical.practiceHelp")}
                                  </span>
                                </div>
                              </div>
                            );
                          }}
                        </For>
                      </Show>
                    </div>
                  </div>
                </div>

                {/* Right Column: Recommended Pedagogical Resources */}
                <div class="rounded-3xl border border-line bg-white p-6 shadow-card">
                  <div class="flex items-center gap-2.5 border-b border-line pb-4">
                    <div class="grid size-8 place-items-center rounded-xl bg-brand-soft text-brand">
                      <Icon name="book" class="size-4" />
                    </div>
                    <div>
                      <h3 class="text-sm font-bold text-ink">
                        {t("report.pedagogical.resources.title")}
                      </h3>
                      <p class="text-xs text-ink-muted">
                        {t("report.pedagogical.resources.description")}
                      </p>
                    </div>
                  </div>

                  <div class="mt-4 space-y-3">
                    <Show
                      when={data().recommended_resources.length > 0}
                      fallback={
                        <p class="py-8 text-center text-xs italic text-ink-muted">
                          {t("report.pedagogical.resources.empty")}
                        </p>
                      }
                    >
                      <For each={data().recommended_resources}>
                        {(rec) => {
                          const tierBadgeClass = () => {
                            switch (rec.priority_tier) {
                              case "urgent":
                                return "bg-rose-100 text-rose-800 border-rose-200";
                              case "practice":
                                return "bg-amber-100 text-amber-800 border-amber-200";
                              default:
                                return "bg-emerald-100 text-emerald-800 border-emerald-200";
                            }
                          };

                          return (
                            <div class="rounded-2xl border border-line bg-canvas/40 p-4 transition-all hover:border-brand/40 hover:bg-white">
                              <div class="flex items-start justify-between gap-3">
                                <div>
                                  <div class="flex flex-wrap items-center gap-2">
                                    <span
                                      class={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${tierBadgeClass()}`}
                                    >
                                      {rec.priority_tier === "urgent"
                                        ? t("report.pedagogical.resourceUrgent")
                                        : rec.priority_tier === "practice"
                                          ? t("report.pedagogical.resourcePractice")
                                          : t("report.pedagogical.resourceEnrichment")}
                                    </span>
                                    <span class="rounded bg-canvas-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-ink-muted">
                                      {rec.resource_type}
                                    </span>
                                  </div>
                                  <h4 class="mt-1.5 text-xs font-bold text-ink">
                                    {rec.title}
                                  </h4>
                                </div>
                                <Show when={rec.url}>
                                  <a
                                    href={rec.url!}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-white text-ink-muted hover:border-brand hover:text-brand"
                                    title={t("backpack.resource.open")}
                                  >
                                    <Icon name="link" class="size-3.5" />
                                  </a>
                                </Show>
                              </div>

                              <Show when={rec.domain_name}>
                                <div class="mt-2 text-[11px] font-semibold text-brand">
                                  {t("report.pedagogical.resourceArea", { name: rec.domain_name ?? "" })}
                                </div>
                              </Show>

                              <Show when={rec.description}>
                                <p class="mt-1 text-xs text-ink-muted line-clamp-2">
                                  {rec.description}
                                </p>
                              </Show>

                              <div class="mt-2 text-[10px] text-ink-faint">
                                {rec.recommendation_reason}
                              </div>
                            </div>
                          );
                        }}
                      </For>
                    </Show>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </Show>

      {/* AI report draft and evidence preview */}
      <Modal
        isOpen={isLlmModalOpen()}
        onClose={() => setIsLlmModalOpen(false)}
        title={t("report.pedagogical.llmDraftModalTitle")}
        description={t("report.pedagogical.llmDraftModalDesc")}
        maxWidth="3xl"
      >
        <div class="space-y-4">
          {/* Generation status */}
          <div class="rounded-2xl border border-brand/20 bg-brand-soft/40 p-4">
            <div class="flex items-start gap-3">
              <div class="grid size-8 shrink-0 place-items-center rounded-xl bg-brand text-white">
                <Icon name="report" class="size-4" />
              </div>
              <div>
                <h4 class="text-xs font-bold text-brand-strong">
                  {generatedDraft()
                    ? t("report.aiDraft.title")
                    : draftGenerationError()
                      ? t("report.pedagogical.llmDraftError")
                      : t("report.pedagogical.llmDraftGenerating")}
                </h4>
                <p class="mt-1 text-xs text-ink-muted leading-relaxed">
                  {generatedDraft()
                    ? t("report.pedagogical.llmDraftReviewHelp")
                    : t("report.pedagogical.llmDraftGenerationHelp")}
                </p>
                <Show when={generatedDraft()}>
                  {(draft) => (
                    <div class="mt-4 space-y-3 rounded-xl border border-line bg-white p-3 text-sm text-ink">
                      <h3 class="font-bold">{draft().document.title}</h3>
                      <p class="whitespace-pre-wrap leading-relaxed">{draft().document.summary}</p>
                      <Show when={draft().document.strengths.length > 0}>
                        <div>
                          <p class="font-semibold">{t("report.aiDraft.strengths")}</p>
                          <ul class="mt-1 list-disc space-y-1 pl-5">
                            <For each={draft().document.strengths}>
                              {(item) => <li>{item.text}</li>}
                            </For>
                          </ul>
                        </div>
                      </Show>
                      <Show when={draft().document.areas_for_improvement.length > 0}>
                        <div>
                          <p class="font-semibold">{t("report.aiDraft.areasForImprovement")}</p>
                          <ul class="mt-1 list-disc space-y-1 pl-5">
                            <For each={draft().document.areas_for_improvement}>
                              {(item) => <li>{item.text}</li>}
                            </For>
                          </ul>
                        </div>
                      </Show>
                      <Show when={draft().document.action_plan.length > 0}>
                        <div>
                          <p class="font-semibold">{t("report.aiDraft.actionPlan")}</p>
                          <ul class="mt-1 list-disc space-y-1 pl-5">
                            <For each={draft().document.action_plan}>
                              {(item) => <li>{item.description}</li>}
                            </For>
                          </ul>
                        </div>
                      </Show>
                      <Show when={draft().document.limitations.length > 0}>
                        <div>
                          <p class="font-semibold">{t("report.aiDraft.limitations")}</p>
                          <ul class="mt-1 list-disc space-y-1 pl-5">
                            <For each={draft().document.limitations}>
                              {(item) => <li>{item}</li>}
                            </For>
                          </ul>
                        </div>
                      </Show>
                    </div>
                  )}
                </Show>
                <Show when={draftGenerationError()}>
                  {(message) => <p class="mt-2 text-xs font-semibold text-danger">{message()}</p>}
                </Show>
                <Show when={draftSaveError()}>
                  {(message) => <p class="mt-2 text-xs font-semibold text-danger">{message()}</p>}
                </Show>
                <Show when={isDraftSaving()}>
                  <p class="mt-2 text-xs text-ink-muted">
                    {t("report.pedagogical.llmDraftGenerating")}
                  </p>
                </Show>
              </div>
            </div>
          </div>

          {/* Prompt Blueprint details */}
          <div class="rounded-2xl border border-line bg-canvas-soft p-4">
            <h4 class="text-xs font-bold uppercase tracking-wider text-ink">
              {t("report.pedagogical.sectionsTitle")}
            </h4>
            <ul class="mt-2 list-inside list-disc space-y-1 text-xs text-ink-muted">
              <li>
                <strong class="text-ink">{t("report.pedagogical.sectionSummaryTitle")}:</strong> {t("report.pedagogical.sectionSummaryHelp")}
              </li>
              <li>
                <strong class="text-ink">{t("report.pedagogical.sectionDiagnosisTitle")}:</strong> {t("report.pedagogical.sectionDiagnosisHelp")}
              </li>
              <li>
                <strong class="text-ink">{t("report.pedagogical.sectionStrengthsTitle")}:</strong> {t("report.pedagogical.sectionStrengthsHelp")}
              </li>
              <li>
                <strong class="text-ink">{t("report.pedagogical.sectionImprovementTitle")}:</strong> {t("report.pedagogical.sectionImprovementHelp")}
              </li>
              <li>
                <strong class="text-ink">{t("report.pedagogical.sectionPlanTitle")}:</strong> {t("report.pedagogical.sectionPlanHelp")}
              </li>
            </ul>
          </div>

          {/* JSON Payload Inspector */}
          <div>
            <div class="flex items-center justify-between pb-1.5">
              <label class="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("report.pedagogical.rawStructure")}
              </label>
              <button
                type="button"
                onClick={handleCopyJson}
                class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-canvas"
              >
                <Icon name={copiedPayload() ? "check" : "report"} class="size-3.5" />
                <span>{copiedPayload() ? t("report.pedagogical.copied") : t("report.pedagogical.copyJson")}</span>
              </button>
            </div>
            <pre class="max-h-72 overflow-auto rounded-2xl border border-line bg-ink p-4 font-mono text-[11px] leading-relaxed text-emerald-400 selection:bg-brand/30">
              {JSON.stringify(reportData.error ? null : reportData(), null, 2)}
            </pre>
            <p class="mt-1 text-[11px] text-ink-muted">
              {t("report.pedagogical.rawStructureHelp")}
            </p>
          </div>

          {/* Review and save actions */}
          <div class="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsLlmModalOpen(false)}>
              {t("common.close")}
            </Button>
            <Show when={generatedDraft()}>
              <Button
                variant="primary"
                disabled={isReportSaving()}
                onClick={handleSaveGeneratedReport}
              >
                {isReportSaving() ? t("common.saving") : t("report.aiDraft.confirmAndSave")}
              </Button>
            </Show>
          </div>
        </div>
      </Modal>
    </div>
  );
};

