import { A } from "@solidjs/router";
import { createResource, For, type Component } from "solid-js";
import { MetricCard } from "../components/dashboard/MetricCard";
import { PageHeader } from "../components/dashboard/PageHeader";
import { Icon, type IconName } from "../components/ui/Icon";
import { useI18n } from "../lib/i18n";
import type { TranslationKey } from "../locales/en";
import { directorService } from "../services/director";
import { useAuth } from "../stores/auth";

interface QuickAction {
  href: string;
  icon: IconName;
  titleKey: TranslationKey;
}

export const DirectorDashboardPage: Component = () => {
  const auth = useAuth();
  const { t } = useI18n();
  const firstName = (): string => auth.user?.firstName || t("dashboard.fallbackName");
  
  const [metrics] = createResource(() => directorService.getMetrics());

  const setupSteps: TranslationKey[] = [
    "director.setup.step1",
    "director.setup.step2",
    "director.setup.step3",
  ];

  const quickActions: QuickAction[] = [
    { href: "/director/classes", icon: "class", titleKey: "director.quickActions.addClass" },
    { href: "/director/students", icon: "students", titleKey: "director.quickActions.addStudent" },
    { href: "/director/teachers", icon: "user", titleKey: "director.quickActions.addTeacher" },
    { href: "/director/assignments", icon: "book", titleKey: "director.quickActions.viewAssignments" },
    { href: "/director/schools", icon: "school", titleKey: "director.quickActions.manageSchool" },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={t("director.eyebrow")}
        title={t("director.title")}
        description={t("director.description")}
      />

      <p class="mt-7 text-lg font-semibold text-ink">
        {t("dashboard.greeting", { name: firstName() })}
      </p>

      {/* Live Metrics */}
      <section class="mt-5 grid gap-4 md:grid-cols-3" aria-label={t("director.title")}>
        <MetricCard
          icon="class"
          title={t("director.classes.title")}
          value={metrics() ? `${metrics()!.classesCount} ${t("director.classes.title").toLowerCase()}` : t("director.classes.value")}
          help={t("director.classes.help")}
        />
        <MetricCard
          icon="students"
          title={t("director.students.title")}
          value={metrics() ? `${metrics()!.studentsCount} ${t("director.students.title").toLowerCase()}` : t("director.students.value")}
          help={t("director.students.help")}
        />
        <MetricCard
          icon="user"
          title={t("director.teachers.title")}
          value={metrics() ? `${metrics()!.teachersCount} ${t("director.teachers.title").toLowerCase()}` : t("director.teachers.value")}
          help={t("director.teachers.help")}
        />
      </section>

      {/* Quick Management Shortcuts */}
      <section class="mt-6">
        <h2 class="text-sm font-bold uppercase tracking-wider text-ink-muted">
          {t("director.quickActions.title")}
        </h2>
        <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <For each={quickActions}>
            {(action) => (
              <A
                href={action.href}
                class="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-line bg-white p-4 text-center shadow-xs transition hover:border-brand hover:bg-brand-soft/40 hover:shadow-card"
              >
                <span class="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon name={action.icon} class="size-5" />
                </span>
                <span class="text-xs font-bold text-ink">{t(action.titleKey)}</span>
              </A>
            )}
          </For>
        </div>
      </section>

      {/* Setup Step Guide */}
      <section class="mt-6 rounded-3xl border border-line bg-white p-6 shadow-card sm:p-8">
        <div class="grid gap-7 lg:grid-cols-[minmax(0,0.8fr)_minmax(22rem,1.2fr)] lg:items-center">
          <div>
            <span class="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Icon name="school" class="size-6" />
            </span>
            <h2 class="mt-5 text-xl font-bold tracking-[-0.025em] text-ink">
              {t("director.setup.title")}
            </h2>
            <p class="mt-2 text-sm leading-6 text-ink-muted">{t("director.setup.description")}</p>
          </div>
          <ol class="overflow-hidden rounded-2xl border border-line">
            <For each={setupSteps}>
              {(step, index) => (
                <li class="flex items-center gap-4 border-b border-line bg-canvas-soft px-4 py-4 last:border-b-0 sm:px-5">
                  <span class="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                    {index() + 1}
                  </span>
                  <span class="min-w-0 flex-1 text-sm font-semibold text-ink">{t(step)}</span>
                  <span class="rounded-full bg-neutral-soft px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-ink-faint">
                    {t("director.setup.pending")}
                  </span>
                </li>
              )}
            </For>
          </ol>
        </div>
      </section>
    </div>
  );
};
