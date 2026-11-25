import { A } from "@solidjs/router";
import { createMemo, createResource, For, Show, type Component } from "solid-js";

import { EmptyPanel } from "../components/dashboard/EmptyPanel";
import { MetricCard } from "../components/dashboard/MetricCard";
import { PageHeader } from "../components/dashboard/PageHeader";
import { Icon } from "../components/ui/Icon";
import { useI18n } from "../lib/i18n";
import { formatCourseLabel } from "../lib/curriculum";
import { studentService } from "../services/student";
import { testAssignmentService } from "../services/test-assignments";
import { testExecutionService } from "../services/test-execution";
import { useAuth } from "../stores/auth";

export const StudentDashboardPage: Component = () => {
  const auth = useAuth();
  const { t, locale } = useI18n();
  const firstName = (): string => auth.user?.firstName || t("dashboard.fallbackName");

  const [profile] = createResource(() => studentService.getProfile());
  const [enrolledClass] = createResource(() => studentService.getEnrolledClass());
  const [school] = createResource(() => studentService.getSchool());
  const [metrics] = createResource(() => studentService.getMetrics());
  const [assignedTests] = createResource(async () => {
    try {
      return await testAssignmentService.getAssignments({ enabled: true });
    } catch {
      return [];
    }
  });

  const [studentAttempts] = createResource(
    () => profile()?.id,
    async (studentId) => {
      if (!studentId) return [];
      try {
        return await testExecutionService.getStudentAttempts(studentId);
      } catch {
        return [];
      }
    },
  );

  const classValue = createMemo(() => {
    if (metrics.loading && !metrics()) return "...";
    return metrics()?.className || t("student.class.none");
  });

  const activityValue = createMemo(() => {
    const tests = assignedTests() || [];
    const atts = studentAttempts() || [];
    if (assignedTests.loading || studentAttempts.loading) return "...";
    if (tests.length === 0) return t("student.activity.none");

    const pendingCount = tests.filter((assignment) => {
      const vRec = assignment.test_version_id as any;
      const allowed = assignment.max_attempts_override || vRec?.max_attempts || 1;
      const assignmentAtts = atts.filter((a) => {
        const aId = typeof a.test_assignment_id === "object" ? (a.test_assignment_id as any)?.id : a.test_assignment_id;
        return aId === assignment.id;
      });
      const completed = assignmentAtts.filter((a) => a.status === "graded" || a.status === "submitted");
      return completed.length < allowed;
    }).length;

    if (pendingCount === 0) return t("student.activity.none");
    if (pendingCount === 1) return t("student.activity.single");
    return t("student.activity.count", { count: String(pendingCount) });
  });

  const resourcesValue = createMemo(() => {
    if (metrics.loading && !metrics()) return "...";
    const count = metrics()?.resourcesCount ?? 0;
    if (count === 1) return t("student.resources.single");
    return t("student.resources.count", { count: String(count) });
  });

  return (
    <div>
      <PageHeader
        eyebrow={t("student.eyebrow")}
        title={t("student.title")}
        description={t("student.description")}
      />

      <p class="mt-7 text-lg font-semibold text-ink">
        {t("dashboard.greeting", { name: firstName() })}
      </p>

      <section class="mt-5 grid gap-4 md:grid-cols-3" aria-label={t("student.title")}>
        <MetricCard
          icon="class"
          title={t("student.class.title")}
          value={classValue()}
          help={t("student.class.help")}
        />
        <MetricCard
          icon="report"
          title={t("student.activity.title")}
          value={activityValue()}
          help={t("student.activity.help")}
        />
        <MetricCard
          icon="book"
          title={t("student.resources.title")}
          value={resourcesValue()}
          help={t("student.resources.help")}
        />
      </section>

      {/* Mochila Pedagógica Direct Link Banner */}
      <div class="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl border border-brand/20 bg-linear-to-r from-brand/10 via-brand/5 to-transparent p-5 shadow-xs">
        <div class="flex items-center gap-3.5">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-xs">
            <Icon name="backpack" class="size-6" />
          </div>
          <div>
            <h3 class="font-bold text-ink text-base">
              {t("backpack.title")}
            </h3>
            <p class="text-xs text-muted mt-0.5">
              {t("backpack.description")}
            </p>
          </div>
        </div>
        <A
          href="/student/backpack"
          class="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-brand-hover transition"
        >
          <span>{t("backpack.title")}</span>
          <Icon name="arrow-right" class="size-4" />
        </A>
      </div>

      <div class="mt-8">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-ink">{t("student.classSection.title")}</h2>
            <p class="mt-0.5 text-sm text-ink-muted">{t("student.classSection.description")}</p>
          </div>
        </div>

        <div class="mt-4">
          <Show
            when={!enrolledClass.loading}
            fallback={
              <div class="flex items-center justify-center p-12 text-sm text-ink-muted">
                {t("app.loading")}
              </div>
            }
          >
            <Show
              when={enrolledClass()}
              fallback={
                <EmptyPanel
                  icon="book"
                  title={t("student.empty.title")}
                  description={t("student.empty.description")}
                />
              }
            >
              {(cls) => (
                <div class="rounded-2xl border border-line bg-white p-6 shadow-card">
                  <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div class="flex items-center gap-2.5">
                        <span class="inline-block rounded-md bg-brand-soft px-2.5 py-0.5 font-mono text-xs font-bold text-brand">
                          {cls().code}
                        </span>
                        <Show when={cls().grade_level}>
                          <span class="inline-block rounded-md bg-canvas px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
                            {formatCourseLabel(cls().grade_level, locale())}
                          </span>
                        </Show>
                      </div>
                      <h3 class="mt-2 text-2xl font-bold tracking-tight text-ink">
                        {cls().name}
                      </h3>
                    </div>
                    <span class="grid size-12 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                      <Icon name="class" class="size-6" />
                    </span>
                  </div>

                  <div class="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2 md:grid-cols-4 text-xs">
                    <div>
                      <span class="block font-semibold text-ink-muted">
                        {t("student.classCard.academicYear")}
                      </span>
                      <span class="mt-1 text-sm font-medium text-ink">{cls().academic_year}</span>
                    </div>

                    <Show when={school()}>
                      {(sch) => (
                        <div>
                          <span class="block font-semibold text-ink-muted">
                            {t("student.classCard.school")}
                          </span>
                          <span class="mt-1 text-sm font-medium text-ink">{sch().name}</span>
                        </div>
                      )}
                    </Show>

                    <Show when={profile()?.external_id}>
                      {(extId) => (
                        <div>
                          <span class="block font-semibold text-ink-muted">
                            {t("student.classCard.studentId")}
                          </span>
                          <span class="mt-1 font-mono text-sm font-medium text-ink">{extId()}</span>
                        </div>
                      )}
                    </Show>

                    <div>
                      <span class="block font-semibold text-ink-muted">
                        {t("student.classCard.code")}
                      </span>
                      <span class="mt-1 font-mono text-sm font-medium text-ink">{cls().code}</span>
                    </div>
                  </div>
                </div>
              )}
            </Show>
          </Show>
        </div>
      </div>

      {/* Assigned Tests Section */}
      <div class="mt-8">
        <div>
          <h2 class="text-lg font-bold text-ink">{t("student.tests.title")}</h2>
          <p class="mt-0.5 text-sm text-ink-muted">{t("student.tests.description")}</p>
        </div>

        <div class="mt-4">
          <Show
            when={!assignedTests.loading}
            fallback={
              <div class="flex items-center justify-center p-8 text-sm text-ink-muted">
                {t("app.loading")}
              </div>
            }
          >
            <Show
              when={assignedTests() && assignedTests()!.length > 0}
              fallback={
                <EmptyPanel
                  icon="report"
                  title={t("student.tests.empty")}
                  description="Your teacher will publish and assign math assessments here."
                />
              }
            >
              <div class="grid gap-4 sm:grid-cols-2">
                <For each={assignedTests()}>
                  {(assignment) => {
                    const testTitle = () => {
                      const tRec = assignment.test_id as any;
    return tRec?.title || t("student.tests.diagnosticFallback");
                    };
                    const versionInfo = () => {
                      const vRec = assignment.test_version_id as any;
                      return vRec ? `v${vRec.version_number} (${vRec.max_score} pts)` : "";
                    };
                    const allowedAttempts = () => {
                      const vRec = assignment.test_version_id as any;
                      return assignment.max_attempts_override || vRec?.max_attempts || 1;
                    };

                    const attList = () => {
                      const all = studentAttempts() || [];
                      return all.filter((a) => {
                        const aId =
                          typeof a.test_assignment_id === "object"
                            ? (a.test_assignment_id as any)?.id
                            : a.test_assignment_id;
                        return aId === assignment.id;
                      });
                    };

                    const activeAttempt = () => attList().find((a) => a.status === "in_progress");
                    const completedAttempts = () =>
                      attList().filter((a) => a.status === "graded" || a.status === "submitted");
                    const latestAttempt = () => {
                      const sorted = [...attList()].sort((a, b) => b.attempt_number - a.attempt_number);
                      return sorted[0] || null;
                    };
                    const isMaxAttemptsReached = () => {
                      return !activeAttempt() && completedAttempts().length >= allowedAttempts();
                    };

                    return (
                      <div class="flex flex-col justify-between rounded-2xl border border-line bg-white p-5 shadow-card">
                        <div>
                          <div class="flex items-center justify-between gap-2">
                            <span class="rounded bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand">
                              {versionInfo()}
                            </span>
                            <div>
                              <Show
                                when={isMaxAttemptsReached()}
                                fallback={
                                  <Show
                                    when={activeAttempt()}
                                    fallback={
                                      <Show
                                        when={assignment.due_at}
                                        fallback={
                                          <span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
                                            {t("student.tests.statusPending")}
                                          </span>
                                        }
                                      >
                                        <span class="text-xs text-ink-muted">
                                          {t("tests.assign.dueAt")}:{" "}
                                          {new Date(assignment.due_at!).toLocaleDateString(locale())}
                                        </span>
                                      </Show>
                                    }
                                  >
                                    <span class="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
                                      {t("student.tests.statusInProgress")}
                                    </span>
                                  </Show>
                                }
                              >
                                <span class="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200">
                                  <Icon name="check" class="size-3 text-emerald-600" />
                                  {t("student.tests.statusCompleted")}
                                </span>
                              </Show>
                            </div>
                          </div>

                          <h3 class="mt-3 text-base font-bold text-ink">{testTitle()}</h3>

                          {/* Attempt / Score details box */}
                          <div class="mt-4 rounded-xl border border-line bg-canvas p-3 flex items-center justify-between text-xs">
                            <Show
                              when={
                                latestAttempt() &&
                                (latestAttempt()!.status === "graded" ||
                                  latestAttempt()!.status === "submitted")
                              }
                              fallback={
                                <>
                                  <span class="text-ink-muted">
                                    {t("student.tests.maxAttempts")}:{" "}
                                    <strong class="text-ink">{allowedAttempts()}</strong>
                                  </span>
                                  <Show when={(assignment.test_version_id as any)?.duration_minutes}>
                                    {(mins) => <span class="text-ink-muted">{mins()} min</span>}
                                  </Show>
                                </>
                              }
                            >
                              <div>
                                <span class="text-ink-muted block text-[11px] uppercase tracking-wider font-semibold">
                                  {t("student.tests.score")}
                                </span>
                                <span class="mt-0.5 font-bold text-sm text-ink">
                                  {latestAttempt()!.score !== null ? Number(latestAttempt()!.score) : "—"} /{" "}
                                  {latestAttempt()!.max_score !== null ? Number(latestAttempt()!.max_score) : "—"}
                                  <Show
                                    when={
                                      latestAttempt()!.score !== null &&
                                      latestAttempt()!.max_score &&
                                      Number(latestAttempt()!.max_score) > 0
                                    }
                                  >
                                    <span class="ml-1 text-xs font-semibold text-emerald-600">
                                      (
                                      {Math.round(
                                        (Number(latestAttempt()!.score) /
                                          Number(latestAttempt()!.max_score)) *
                                          100,
                                      )}
                                      %)
                                    </span>
                                  </Show>
                                </span>
                              </div>
                              <div class="text-right">
                                <span class="text-ink-muted block text-[11px] uppercase tracking-wider font-semibold">
                                  {t("student.tests.attempts")}
                                </span>
                                <span class="mt-0.5 font-semibold text-ink">
                                  {completedAttempts().length} / {allowedAttempts()}
                                </span>
                              </div>
                            </Show>
                          </div>
                        </div>

                        {/* Action buttons with blocked state when max attempts reached */}
                        <div class="mt-5 border-t border-line pt-4 flex items-center justify-between">
                          <Show
                            when={isMaxAttemptsReached()}
                            fallback={
                              <Show
                                when={activeAttempt()}
                                fallback={
                                  <Show
                                    when={completedAttempts().length > 0}
                                    fallback={
                                      /* 0 attempts: fresh start */
                                      <A
                                        href={`/student/tests/${assignment.id}`}
                                        class="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors ml-auto"
                                      >
                                        <Icon name="check" class="size-3.5" />
                                        {t("student.tests.start")}
                                      </A>
                                    }
                                  >
                                    {/* Attempts completed, but more remaining */}
                                    <A
                                      href={`/student/tests/${assignment.id}?action=review`}
                                      class="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white hover:bg-canvas px-3 py-2 text-xs font-semibold text-ink transition-colors"
                                    >
                                      <Icon name="report" class="size-3.5" />
                                      {t("student.tests.viewResults")}
                                    </A>
                                    <A
                                      href={`/student/tests/${assignment.id}`}
                                      class="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
                                    >
                                      <Icon name="check" class="size-3.5" />
                                      {t("student.tests.retake")}
                                    </A>
                                  </Show>
                                }
                              >
                                {/* Active attempt in progress */}
                                <span class="text-xs text-amber-700 font-medium">
                                  {t("student.tests.statusInProgress")}
                                </span>
                                <A
                                  href={`/student/tests/${assignment.id}`}
                                  class="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 transition-colors"
                                >
                                  <Icon name="chevron-right" class="size-3.5" />
                                  {t("student.tests.resume")}
                                </A>
                              </Show>
                            }
                          >
                            {/* Max attempts reached: button to retake is blocked, replaced with viewResults + status */}
                            <div class="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                              <Icon name="check" class="size-3.5 text-emerald-600" />
                              <span>{t("student.tests.noAttemptsLeft")}</span>
                            </div>
                            <A
                              href={`/student/tests/${assignment.id}?action=review`}
                              class="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white hover:bg-canvas px-3.5 py-2 text-xs font-semibold text-ink shadow-sm transition-colors"
                            >
                              <Icon name="report" class="size-3.5 text-ink-muted" />
                              {t("student.tests.viewResults")}
                            </A>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
};

