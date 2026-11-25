import { A } from "@solidjs/router";
import { createMemo, createResource, For, Show, type Component } from "solid-js";

import { EmptyPanel } from "../components/dashboard/EmptyPanel";
import { MetricCard } from "../components/dashboard/MetricCard";
import { PageHeader } from "../components/dashboard/PageHeader";
import { Icon } from "../components/ui/Icon";
import { useI18n } from "../lib/i18n";
import { formatCourseLabel } from "../lib/curriculum";
import { teacherService } from "../services/teacher";
import { useAuth } from "../stores/auth";

export const TeacherDashboardPage: Component = () => {
  const auth = useAuth();
  const { t, locale } = useI18n();
  const firstName = (): string => auth.user?.firstName || t("dashboard.fallbackName");

  const [metrics] = createResource(() => teacherService.getMetrics());
  const [classes] = createResource(() => teacherService.getAssignedClasses());
  const [students] = createResource(() => teacherService.getStudents());
  const [classStudents] = createResource(() => teacherService.getClassStudents());

  const classesValue = createMemo(() => {
    if (metrics.loading && !metrics()) return "...";
    const count = metrics()?.classesCount ?? (classes()?.length ?? 0);
    if (count === 1) return t("teacher.classes.single");
    return t("teacher.classes.count", { count: String(count) });
  });

  const studentsValue = createMemo(() => {
    if (metrics.loading && !metrics()) return "...";
    const count = metrics()?.studentsCount ?? (students()?.length ?? 0);
    if (count === 1) return t("teacher.students.single");
    return t("teacher.students.count", { count: String(count) });
  });

  const reportsValue = createMemo(() => {
    if (metrics.loading && !metrics()) return "...";
    const count = metrics()?.reportsCount ?? 0;
    if (count === 1) return t("teacher.reports.single");
    return t("teacher.reports.count", { count: String(count) });
  });

  const classesWithStudents = createMemo(() => {
    const cls = classes() || [];
    const stus = students() || [];
    const enrollments = classStudents() || [];

    return cls.map((c) => {
      const studentIds = new Set(
        enrollments
          .filter((item) => {
            const classId =
              typeof item.class_id === "object" && item.class_id !== null
                ? item.class_id.id
                : String(item.class_id);
            return classId === c.id;
          })
          .map((item) =>
            typeof item.student_id === "object" && item.student_id !== null
              ? item.student_id.id
              : String(item.student_id),
          ),
      );

      const classEnrolled = stus.filter((s) => studentIds.has(s.id));
      return {
        ...c,
        enrolledStudents: classEnrolled,
      };
    });
  });

  return (
    <div>
      <PageHeader
        eyebrow={t("teacher.eyebrow")}
        title={t("teacher.title")}
        description={t("teacher.description")}
      />

      <p class="mt-7 text-lg font-semibold text-ink">
        {t("dashboard.greeting", { name: firstName() })}
      </p>

      <section class="mt-5 grid gap-4 md:grid-cols-3" aria-label={t("teacher.title")}>
        <MetricCard
          icon="class"
          title={t("teacher.classes.title")}
          value={classesValue()}
          help={t("teacher.classes.help")}
        />
        <MetricCard
          icon="students"
          title={t("teacher.students.title")}
          value={studentsValue()}
          help={t("teacher.students.help")}
        />
        <MetricCard
          icon="report"
          title={t("teacher.reports.title")}
          value={reportsValue()}
          help={t("teacher.reports.help")}
        />
      </section>

      <div class="mt-8">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold text-ink">{t("teacher.classesSection.title")}</h2>
            <p class="mt-0.5 text-sm text-ink-muted">{t("teacher.classesSection.description")}</p>
          </div>
          <span class="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">
            {classesValue()}
          </span>
        </div>

        <div class="mt-4">
          <Show
            when={!classes.loading}
            fallback={
              <div class="flex items-center justify-center p-12 text-sm text-ink-muted">
                {t("app.loading")}
              </div>
            }
          >
            <Show
              when={classesWithStudents().length > 0}
              fallback={
                <EmptyPanel
                  icon="class"
                  title={t("teacher.empty.title")}
                  description={t("teacher.empty.description")}
                />
              }
            >
              <div class="grid gap-5 md:grid-cols-2">
                <For each={classesWithStudents()}>
                  {(classItem) => (
                    <article class="flex flex-col justify-between rounded-2xl border border-line bg-white p-6 shadow-card transition-shadow hover:shadow-md">
                      <div>
                        <div class="flex items-start justify-between gap-4">
                          <div>
                            <span class="inline-block rounded-md bg-brand-soft px-2.5 py-0.5 font-mono text-xs font-bold text-brand">
                              {classItem.code}
                            </span>
                            <h3 class="mt-2 text-xl font-bold tracking-tight text-ink">
                              {classItem.name}
                            </h3>
                          </div>
                          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas text-brand">
                            <Icon name="class" class="size-5" />
                          </span>
                        </div>

                        <div class="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-y border-line py-3 text-xs text-ink-muted">
                          <div>
                            <span class="font-semibold text-ink">
                              {t("teacher.classCard.academicYear")}:{" "}
                            </span>
                            <span>{classItem.academic_year}</span>
                          </div>
                          <Show when={classItem.grade_level}>
                            <div>
                              <span class="font-semibold text-ink">
                                {t("teacher.classCard.gradeLevel")}:{" "}
                              </span>
                              <span class="rounded bg-canvas px-1.5 py-0.5 font-medium text-ink">
                                {formatCourseLabel(classItem.grade_level, locale())}
                              </span>
                            </div>
                          </Show>
                        </div>

                        <div class="mt-4">
                          <p class="text-xs font-bold uppercase tracking-wider text-ink-faint">
                            {t("teacher.classCard.enrolledStudents")} (
                            {classItem.enrolledStudents.length})
                          </p>

                          <div class="mt-2.5">
                            <Show
                              when={classItem.enrolledStudents.length > 0}
                              fallback={
                                <p class="text-xs italic text-ink-faint">
                                  {t("teacher.classCard.noStudents")}
                                </p>
                              }
                            >
                              <div class="flex flex-wrap gap-2">
                                <For each={classItem.enrolledStudents}>
                                  {(student) => (
                                    <span class="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-ink">
                                      <Icon name="students" class="size-3.5 text-brand" />
                                      {student.first_name} {student.last_name}
                                    </span>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        </div>
                      </div>

                      <div class="mt-6 border-t border-line pt-4">
                        <A
                          href={`/teacher/classes/${classItem.id}`}
                          class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-brand-emphasis"
                        >
                          <Icon name="report" class="size-4" />
                          {t("teacher.classCard.viewClass")}
                        </A>
                      </div>
                    </article>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  );
};
