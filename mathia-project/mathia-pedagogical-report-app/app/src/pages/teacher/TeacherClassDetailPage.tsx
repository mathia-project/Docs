import { A, useParams } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Show, type Component } from "solid-js";
import { EmptyPanel } from "../../components/dashboard/EmptyPanel";
import { MetricCard } from "../../components/dashboard/MetricCard";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { AttemptReviewModal } from "../../components/teacher/AttemptReviewModal";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";
import { formatCourseLabel } from "../../lib/curriculum";
import { computeClassStats, teacherService, type ClassAggregatedStats } from "../../services/teacher";
import type { StudentProfile } from "../../services/schema";
import type { EvidenceStatus } from "../../services/student";

export const TeacherClassDetailPage: Component = () => {
  const { t, locale } = useI18n();
  const params = useParams();
  const classId = () => params.id || "";

  const [activeTab, setActiveTab] = createSignal<"tests" | "students" | "curriculum">("tests");
  const [expandedStudentId, setExpandedStudentId] = createSignal<string | null>(null);

  const [curricularBreakdown] = createResource(
    () => ({ id: classId(), loc: locale() }),
    ({ id, loc }) => teacherService.getClassCurricularBreakdown(id, loc),
  );

  const [expandedCurriculumDomains, setExpandedCurriculumDomains] = createSignal<Record<string, boolean>>({});
  const toggleCurriculumDomain = (domainId: string) => {
    setExpandedCurriculumDomains((prev) => ({ ...prev, [domainId]: !prev[domainId] }));
  };

  const [expandedCurriculumStandards, setExpandedCurriculumStandards] = createSignal<Record<string, boolean>>({});
  const toggleCurriculumStandard = (standardId: string) => {
    setExpandedCurriculumStandards((prev) => ({ ...prev, [standardId]: !prev[standardId] }));
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

  // Review modal state
  const [reviewModal, setReviewModal] = createSignal<{
    isOpen: boolean;
    attemptId: string | null;
    studentName?: string | undefined;
    testTitle?: string | undefined;
    attemptNumber?: number | undefined;
  }>({
    isOpen: false,
    attemptId: null,
  });

  const [classRecord] = createResource(classId, (id) => teacherService.getClass(id));
  const [classStudents] = createResource(classId, (id) => teacherService.getClassStudents(id));
  const [allStudents] = createResource(() => teacherService.getStudents());
  const [assignments] = createResource(classId, (id) => teacherService.getClassAssignments(id));
  const [attempts] = createResource(classId, (id) => teacherService.getClassAttempts(id));

  const enrolledStudents = createMemo<StudentProfile[]>(() => {
    const enrollments = classStudents() || [];
    const stus = allStudents() || [];

    const enrolledIds = new Set(
      enrollments
        .filter((e) => e.active !== false)
        .map((e) =>
          typeof e.student_id === "object" && e.student_id !== null
            ? e.student_id.id
            : String(e.student_id),
        ),
    );

    return stus.filter((s) => enrolledIds.has(s.id));
  });

  const stats = createMemo<ClassAggregatedStats>(() => {
    return computeClassStats(
      classId(),
      enrolledStudents(),
      assignments() || [],
      attempts() || [],
    );
  });

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "-";
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(locale(), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const openAttemptReview = (
    attemptId: string,
    studentName: string,
    testTitle: string,
    attemptNumber?: number | undefined,
  ) => {
    setReviewModal({
      isOpen: true,
      attemptId,
      studentName,
      testTitle,
      attemptNumber,
    });
  };

  return (
    <div class="mx-auto max-w-6xl pb-16">
      {/* Back Link */}
      <div class="mb-4">
        <A
          href="/teacher/classes"
          class="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition-colors hover:text-brand"
        >
          <Icon name="arrow-left" class="size-4" />
          {t("common.back")}
        </A>
      </div>

      {/* Header */}
      <Show
        when={!classRecord.loading && classRecord()}
        fallback={
          <div class="flex items-center justify-center p-12 text-sm text-ink-muted">
            {t("app.loading")}
          </div>
        }
      >
        {(cls) => (
          <>
            <PageHeader
              eyebrow={t("teacher.classDetail.eyebrow")}
              title={`${cls().name} (${cls().code})`}
              description={`${t("teacher.classCard.academicYear")}: ${cls().academic_year}${
                cls().grade_level ? ` • ${formatCourseLabel(cls().grade_level, locale())}` : ""
              }`}
            />

            {/* Top Metric Cards */}
            <section class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                icon="students"
                title={t("teacher.classDetail.totalStudents")}
                value={String(stats().total_students)}
                help={`${stats().total_students} ${t("teacher.classes.count", { count: String(stats().total_students) })}`}
              />
              <MetricCard
                icon="report"
                title={t("teacher.classDetail.assignedTests")}
                value={String(stats().total_assignments)}
                help={`${stats().total_assignments} ${t("nav.tests").toLowerCase()}`}
              />
              <MetricCard
                icon="check"
                title={t("teacher.classDetail.completedAttempts")}
                value={String(stats().total_completed_attempts)}
                help={t("teacher.classDetail.completedAttempts")}
              />
              <MetricCard
                icon="dashboard"
                title={t("teacher.classDetail.classAverage")}
                value={`${stats().class_average_percent}%`}
                help={t("teacher.classDetail.averageScore")}
              />
            </section>

            {/* Tabs */}
            <div class="mt-10 border-b border-line">
              <div class="flex gap-4">
                <button
                  type="button"
                  onClick={() => setActiveTab("tests")}
                  class={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    activeTab() === "tests"
                      ? "border-brand text-brand"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  <Icon name="report" class="size-4" />
                  {t("teacher.classDetail.tabTests")}
                  <span class="rounded-full bg-canvas px-2 py-0.5 text-xs font-bold text-ink-muted">
                    {stats().test_stats.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("students")}
                  class={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    activeTab() === "students"
                      ? "border-brand text-brand"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  <Icon name="students" class="size-4" />
                  {t("teacher.classDetail.tabStudents")}
                  <span class="rounded-full bg-canvas px-2 py-0.5 text-xs font-bold text-ink-muted">
                    {stats().student_stats.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("curriculum")}
                  class={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                    activeTab() === "curriculum"
                      ? "border-brand text-brand"
                      : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  <Icon name="backpack" class="size-4" />
              {t("nav.curriculum")}
                  <Show when={curricularBreakdown()}>
                    {(data) => (
                      <span class="rounded-full bg-canvas px-2 py-0.5 text-xs font-bold text-ink-muted">
                        {data().length}
                      </span>
                    )}
                  </Show>
                </button>
              </div>
            </div>

            {/* Tab 1: Tests View */}
            <Show when={activeTab() === "tests"}>
              <div class="mt-6 flex flex-col gap-6">
                <Show
                  when={stats().test_stats.length > 0}
                  fallback={
                    <EmptyPanel
                      icon="report"
                      title={t("teacher.classDetail.noTests")}
                      description={t("teacher.empty.description")}
                    />
                  }
                >
                  <For each={stats().test_stats}>
                    {(testItem) => (
                      <article class="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
                        {/* Test Header */}
                        <div class="border-b border-line bg-canvas/60 p-6">
                          <div class="flex flex-wrap items-start justify-between gap-4">
                            <div>
                              <div class="flex items-center gap-2">
                                <span class="rounded-md bg-brand-soft px-2.5 py-0.5 font-mono text-xs font-bold text-brand">
                                  v{testItem.version_number}
                                </span>
                                <Show when={testItem.duration_minutes}>
                                  <span class="text-xs font-medium text-ink-muted">
                                    ⏱️ {testItem.duration_minutes} min
                                  </span>
                                </Show>
                                <span class="text-xs font-medium text-ink-muted">
                                  🎯 {testItem.max_score} pts max
                                </span>
                              </div>
                              <h3 class="mt-2 text-xl font-bold text-ink">{testItem.test_title}</h3>
                              <Show when={testItem.due_at}>
                                <p class="mt-1 text-xs text-ink-muted">
                                  {t("common.status")}:{" "}
                                  <span class="font-medium">
                                    {formatDate(testItem.available_from)} → {formatDate(testItem.due_at)}
                                  </span>
                                </p>
                              </Show>
                            </div>

                            {/* Aggregated Score Badge */}
                            <div class="flex flex-col items-end gap-1">
                              <span class="text-xs font-semibold text-ink-muted">
                                {t("teacher.classDetail.averageScore")}
                              </span>
                              <div class="flex items-baseline gap-1.5">
                                <span class="text-2xl font-black text-brand">
                                  {testItem.average_score}
                                </span>
                                <span class="text-sm font-semibold text-ink-muted">
                                  / {testItem.max_score}
                                </span>
                                <span class="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">
                                  {testItem.average_percent}%
                                </span>
                              </div>
                              <span class="text-2xs text-ink-faint">
                                {t("teacher.classDetail.scoreRange", {
                                  min: String(testItem.lowest_score),
                                  max: String(testItem.highest_score),
                                })}
                              </span>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div class="mt-5">
                            <div class="flex items-center justify-between text-xs font-medium text-ink-muted">
                              <span>{t("teacher.classDetail.participation")}</span>
                              <span>
                                {t("teacher.classDetail.completionRate", {
                                  completed: String(testItem.completed_count),
                                  total: String(testItem.total_assigned),
                                  percent: String(testItem.completion_rate_percent),
                                })}
                              </span>
                            </div>
                            <div class="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-line/60">
                              <div
                                class="h-full rounded-full bg-brand transition-all"
                                style={{ width: `${testItem.completion_rate_percent}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Students Table for this test */}
                        <div class="overflow-x-auto">
                          <table class="w-full text-left text-sm">
                            <thead class="border-b border-line bg-canvas/30 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                              <tr>
                                <th class="px-6 py-3">{t("teacher.classDetail.table.student")}</th>
                                <th class="px-6 py-3">{t("teacher.classDetail.table.status")}</th>
                                <th class="px-6 py-3">{t("teacher.classDetail.table.score")}</th>
                                <th class="px-6 py-3">{t("teacher.classDetail.table.date")}</th>
                                <th class="px-6 py-3 text-right">
                                  {t("teacher.classDetail.table.actions")}
                                </th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-line">
                              <For each={enrolledStudents()}>
                                {(student) => {
                                  const attempt = testItem.attempts_by_student[student.id];
                                  const isCompleted =
                                    attempt &&
                                    (attempt.status === "graded" || attempt.status === "submitted");
                                  const isInProgress = attempt && attempt.status === "in_progress";

                                  return (
                                    <tr class="transition-colors hover:bg-canvas/40">
                                      {/* Student info */}
                                      <td class="px-6 py-4">
                                        <div class="font-bold text-ink">
                                          {student.first_name} {student.last_name}
                                        </div>
                                        <div class="text-xs text-ink-muted font-mono">
                                          {student.external_id || student.email || "-"}
                                        </div>
                                      </td>

                                      {/* Status */}
                                      <td class="px-6 py-4">
                                        <Show when={isCompleted}>
                                          <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                            <span class="size-1.5 rounded-full bg-emerald-500" />
                                            {t("teacher.classDetail.studentStatus.completed")}
                                          </span>
                                        </Show>
                                        <Show when={isInProgress}>
                                          <span class="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                                            <span class="size-1.5 rounded-full bg-amber-500" />
                                            {t("teacher.classDetail.studentStatus.inProgress")}
                                          </span>
                                        </Show>
                                        <Show when={!attempt}>
                                          <span class="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                                            <span class="size-1.5 rounded-full bg-sky-500" />
                                            {t("teacher.classDetail.studentStatus.pending")}
                                          </span>
                                        </Show>
                                      </td>

                                      {/* Score */}
                                      <td class="px-6 py-4">
                                        <Show when={isCompleted} fallback={<span class="text-ink-muted">-</span>}>
                                          <div class="font-bold text-ink">
                                            {attempt!.score} / {attempt!.max_score}
                                          </div>
                                          <div class="text-xs text-ink-muted">
                                            {Number(attempt!.max_score) > 0
                                              ? `${Math.round(
                                                  (Number(attempt!.score) / Number(attempt!.max_score)) *
                                                    100,
                                                )}%`
                                              : "-"}
                                          </div>
                                        </Show>
                                      </td>

                                      {/* Date */}
                                      <td class="px-6 py-4 text-xs text-ink-muted">
                                        {formatDate(attempt?.submitted_at || attempt?.created_at)}
                                      </td>

                                      {/* Actions */}
                                      <td class="px-6 py-4 text-right">
                                        <Show when={isCompleted}>
                                          <Button
                                            variant="secondary"
                                            class="min-h-0 px-3 py-1.5 text-xs"
                                            onClick={() =>
                                              openAttemptReview(
                                                attempt!.id,
                                                `${student.first_name} ${student.last_name}`,
                                                testItem.test_title,
                                                attempt!.attempt_number,
                                              )
                                            }
                                          >
                                            <Icon name="report" class="size-3.5" />
                                            {t("teacher.classDetail.reviewExam")}
                                          </Button>
                                        </Show>
                                      </td>
                                    </tr>
                                  );
                                }}
                              </For>
                            </tbody>
                          </table>
                        </div>
                      </article>
                    )}
                  </For>
                </Show>
              </div>
            </Show>

            {/* Tab 2: Students View */}
            <Show when={activeTab() === "students"}>
              <div class="mt-6 overflow-hidden rounded-3xl border border-line bg-white shadow-card">
                <Show
                  when={stats().student_stats.length > 0}
                  fallback={
                    <div class="p-8">
                      <EmptyPanel
                        icon="students"
                        title={t("teacher.classDetail.noStudents")}
                        description={t("teacher.empty.description")}
                      />
                    </div>
                  }
                >
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-sm">
                      <thead class="border-b border-line bg-canvas/50 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                        <tr>
                          <th class="px-6 py-3.5">{t("teacher.classDetail.table.student")}</th>
                          <th class="px-6 py-3.5">{t("teacher.classDetail.codeEmail")}</th>
                          <th class="px-6 py-3.5">
                            {t("teacher.classDetail.tabTests")}
                          </th>
                          <th class="px-6 py-3.5">
                            {t("teacher.classDetail.averageScore")}
                          </th>
                          <th class="px-6 py-3.5 text-right">
                            {t("teacher.classDetail.table.actions")}
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-line">
                        <For each={stats().student_stats}>
                          {(stu) => {
                            const isExpanded = () => expandedStudentId() === stu.student_id;
                            const toggleExpand = () => {
                              setExpandedStudentId(isExpanded() ? null : stu.student_id);
                            };

                            return (
                              <>
                                <tr class="transition-colors hover:bg-canvas/30">
                                  {/* Student Name */}
                                  <td class="px-6 py-4">
                                    <div class="flex items-center gap-3">
                                      <span class="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand font-bold text-xs">
                                        {stu.first_name[0]}
                                        {stu.last_name[0]}
                                      </span>
                                      <div>
                                        <div class="font-bold text-ink">
                                          {stu.first_name} {stu.last_name}
                                        </div>
                                        <Show when={stu.has_diagnosis}>
                                          <span
                                            class="mt-1 inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700"
                                            title={stu.diagnosis_notes || undefined}
                                          >
                                            {t("director.students.diagnosisActive")}
                                          </span>
                                        </Show>
                                        <Show when={!stu.has_diagnosis && stu.needs_evaluation}>
                                          <span class="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                            {t("director.students.evaluationAlert")}
                                          </span>
                                        </Show>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Identifier / Email */}
                                  <td class="px-6 py-4 text-xs font-mono text-ink-muted">
                                    <div>{stu.external_id || "-"}</div>
                                    <div>{stu.email || "-"}</div>
                                  </td>

                                  {/* Tests Completed */}
                                  <td class="px-6 py-4">
                                    <span class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs font-semibold text-ink">
                                      {t("teacher.classDetail.studentTestsCompleted", {
                                        completed: String(stu.completed_tests_count),
                                        total: String(stu.total_assigned_tests_count),
                                      })}
                                    </span>
                                  </td>

                                  {/* Average Score */}
                                  <td class="px-6 py-4">
                                    <Show
                                      when={stu.completed_tests_count > 0}
                                      fallback={<span class="text-ink-muted">-</span>}
                                    >
                                      <span class="font-bold text-brand">
                                        {stu.average_score_percent}%
                                      </span>
                                    </Show>
                                  </td>

                                  {/* Actions */}
                                  <td class="px-6 py-4 text-right">
                                    <div class="flex items-center justify-end gap-2">
                                      <A
                                        href={`/teacher/classes/${classId()}/students/${stu.student_id}/report`}
                                        class="inline-flex items-center gap-1.5 rounded-xl border border-brand/20 bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand transition hover:bg-brand hover:text-white"
                                      >
                                        <Icon name="report" class="size-3.5" />
                                        {t("teacher.classDetail.viewReport")}
                                      </A>
                                      <Button
                                        variant="secondary"
                                        class="min-h-0 px-3 py-1.5 text-xs"
                                        onClick={toggleExpand}
                                      >
                                        <Icon name={isExpanded() ? "x" : "arrow-right"} class="size-3.5" />
                                        {t("teacher.classDetail.studentHistory")}
                                      </Button>
                                    </div>
                                  </td>
                                </tr>

                                {/* Expanded attempts list */}
                                <Show when={isExpanded()}>
                                  <tr class="bg-canvas/60">
                                    <td colspan={5} class="px-6 py-4">
                                      <div class="rounded-2xl border border-line bg-white p-4">
                                        <h4 class="text-xs font-bold uppercase tracking-wider text-ink-muted">
                                          {t("teacher.classDetail.studentHistory")} — {stu.first_name} {stu.last_name}
                                        </h4>

                                        <Show
                                          when={stu.attempts.length > 0}
                                          fallback={
                                            <p class="mt-2 text-xs italic text-ink-faint">
                                              {t("teacher.classDetail.noTests")}
                                            </p>
                                          }
                                        >
                                          <div class="mt-3 flex flex-col gap-2">
                                            <For each={stu.attempts}>
                                              {(att) => {
                                                const asg = (assignments() || []).find((a) => {
                                                  const aId =
                                                    typeof att.test_assignment_id === "object" && att.test_assignment_id !== null
                                                      ? att.test_assignment_id.id
                                                      : String(att.test_assignment_id);
                                                  return aId === a.id;
                                                });
                                                const testTitle =
                                                  typeof asg?.test_id === "object" && asg.test_id !== null
                                                    ? asg.test_id.title
                                                    : "Prueba";

                                                return (
                                                  <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm">
                                                    <div class="flex items-center gap-3">
                                                      <span class="font-bold text-ink">
                                                        {testTitle}
                                                      </span>
                                                      <span class="rounded bg-canvas px-2 py-0.5 font-mono text-2xs text-ink-muted">
                                                        #{att.attempt_number}
                                                      </span>
                                                      <span class="text-xs text-ink-muted">
                                                        {formatDate(att.submitted_at || att.created_at)}
                                                      </span>
                                                    </div>

                                                    <div class="flex items-center gap-4">
                                                      <span class="font-bold text-brand">
                                                        {att.score ?? "-"} / {att.max_score} pts
                                                      </span>
                                                      <Button
                                                        variant="secondary"
                                                        class="min-h-0 px-3 py-1.5 text-xs"
                                                        onClick={() =>
                                                          openAttemptReview(
                                                            att.id,
                                                            `${stu.first_name} ${stu.last_name}`,
                                                            testTitle,
                                                            att.attempt_number,
                                                          )
                                                        }
                                                      >
                                                        <Icon name="report" class="size-3" />
                                                        {t("teacher.classDetail.reviewExam")}
                                                      </Button>
                                                    </div>
                                                  </div>
                                                );
                                              }}
                                            </For>
                                          </div>
                                        </Show>
                                      </div>
                                    </td>
                                  </tr>
                                </Show>
                              </>
                            );
                          }}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Tab 3: Curriculum & Standards View */}
            <Show when={activeTab() === "curriculum"}>
              <div class="mt-6 flex flex-col gap-6">
                <Show
                  when={!curricularBreakdown.loading}
                  fallback={
                    <div class="rounded-3xl border border-line bg-white p-12 text-center text-sm text-ink-muted">
                      {t("common.loading")}
                    </div>
                  }
                >
                  <Show
                    when={(curricularBreakdown()?.length ?? 0) > 0}
                    fallback={
                      <div class="rounded-3xl border border-line bg-white p-8">
                        <EmptyPanel
                          icon="backpack"
                                        title={t("teacher.classDetail.noStandardsTitle")}
                                        description={t("teacher.classDetail.noStandardsHelp")}
                        />
                      </div>
                    }
                  >
                    <div class="grid grid-cols-1 gap-5">
                      <For each={curricularBreakdown()}>
                        {(domain) => (
                          <div class="rounded-3xl border border-line bg-white p-6 shadow-card transition-all">
                            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-line pb-4">
                              <div class="flex items-center gap-3">
                                <div class="flex size-10 items-center justify-center rounded-2xl bg-brand-soft text-brand font-bold">
                                  <Icon name="backpack" class="size-5" />
                                </div>
                                <div>
                                  <h3 class="text-base font-bold text-ink">{domain.categoryName}</h3>
                                  <p class="text-xs text-ink-muted">
                                    {domain.standards.length} {t("backpack.hierarchy.standards").toLowerCase()}
                                  </p>
                                </div>
                              </div>
                              <div class="flex items-center gap-4 self-start sm:self-auto">
                                <div class="text-right">
                                  <span class="text-xs text-ink-muted">{t("teacher.classDetail.classAverageLabel")}</span>
                                  <div class="text-lg font-black text-brand">
                                    {domain.score !== null ? `${domain.score.toFixed(1)} / 15` : "— / 15"}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  class="text-xs font-bold text-brand hover:underline"
                                  onClick={() => toggleCurriculumDomain(domain.categoryId)}
                                >
                                  {expandedCurriculumDomains()[domain.categoryId]
                                    ? t("backpack.hierarchy.hideStandards")
                                    : t("backpack.hierarchy.toggleStandards", { count: String(domain.standards.length) })}
                                </button>
                              </div>
                            </div>

                            {/* Collapsible Standards */}
                            <Show when={expandedCurriculumDomains()[domain.categoryId]}>
                              <div class="mt-5 space-y-3">
                                <For each={domain.standards}>
                                  {(std) => (
                                    <div class="rounded-2xl border border-line/80 bg-canvas/40 p-4 transition-all">
                                      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                        <div class="flex-1">
                                          <div class="flex items-center gap-2">
                                            <span class="rounded bg-brand/10 px-2 py-0.5 font-mono text-xs font-bold text-brand">
                                              {std.code}
                                            </span>
                                            <span
                                              class={`rounded-md border px-2 py-0.5 text-xs font-semibold ${getEvidenceBadgeClass(
                                                std.evidenceStatus,
                                              )}`}
                                            >
                                              {t(`backpack.evidence.${std.evidenceStatus}` as any)}
                                            </span>
                                          </div>
                                          <p class="mt-2 text-xs leading-relaxed text-ink">
                                            {std.description}
                                          </p>
                                        </div>

                                        <div class="flex shrink-0 sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1">
                                          <div class="text-right">
                                            <span class="text-xs text-ink-muted">{t("teacher.classDetail.classAverageLabel")}</span>
                                            <div class="text-lg font-black text-brand">
                                              {std.score !== null ? `${std.score.toFixed(1)} / 15` : "— / 15"}
                                            </div>
                                          </div>
                                          <span class="text-2xs text-ink-muted">
                                            {t("teacher.classDetail.standardStats", { evaluated: std.evaluatedStudentsCount, students: std.totalStudentsCount, correct: std.correctCount, total: std.totalQuestionsCount })}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Substandards Toggle */}
                                      <Show when={std.substandards.length > 0}>
                                        <div class="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5">
                                          <button
                                            type="button"
                                            class="text-xs font-semibold text-brand hover:underline"
                                            onClick={() => toggleCurriculumStandard(std.standardId)}
                                          >
                                            {expandedCurriculumStandards()[std.standardId] ? `▲ ${t("common.hide")}` : `▼ ${t("common.show")}`}{" "}
                                            {std.substandards.length} {t("backpack.hierarchy.substandards").toLowerCase()}
                                          </button>
                                        </div>

                                        <Show when={expandedCurriculumStandards()[std.standardId]}>
                                          <div class="mt-3 space-y-2 border-l-2 border-brand/30 pl-3">
                                            <For each={std.substandards}>
                                              {(sub) => (
                                                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-line bg-white p-3 text-xs">
                                                  <div class="flex-1">
                                                    <div class="flex items-center gap-2">
                                                      <span class="font-mono font-bold text-ink">
                                                        {sub.code}
                                                      </span>
                                                      <span
                                                        class={`rounded border px-1.5 py-0.2 text-[10px] font-medium ${getEvidenceBadgeClass(
                                                          sub.evidenceStatus,
                                                        )}`}
                                                      >
                                                        {t(`backpack.evidence.${sub.evidenceStatus}` as any)}
                                                      </span>
                                                    </div>
                                                    <p class="mt-1 text-ink-muted line-clamp-2">
                                                      {sub.description}
                                                    </p>
                                                  </div>
                                                  <div class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1 shrink-0">
                                                    <span class="font-black text-brand">
                                                      {sub.score !== null ? `${sub.score.toFixed(1)} / 15` : "— / 15"}
                                                    </span>
                                                    <span class="text-[10px] text-ink-muted">
                                                      {t("teacher.classDetail.substandardStats", { evaluated: sub.evaluatedStudentsCount, students: sub.totalStudentsCount, correct: sub.correctCount, total: sub.totalQuestionsCount })}
                                                    </span>
                                                  </div>
                                                </div>
                                              )}
                                            </For>
                                          </div>
                                        </Show>
                                      </Show>
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
                </Show>
              </div>
            </Show>
          </>
        )}
      </Show>

      {/* Review Modal */}
      <AttemptReviewModal
        isOpen={reviewModal().isOpen}
        onClose={() => setReviewModal((prev) => ({ ...prev, isOpen: false }))}
        attemptId={reviewModal().attemptId}
        studentName={reviewModal().studentName}
        testTitle={reviewModal().testTitle}
        attemptNumber={reviewModal().attemptNumber}
      />
    </div>
  );
};
