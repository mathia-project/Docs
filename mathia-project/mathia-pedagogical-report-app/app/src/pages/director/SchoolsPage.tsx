import { createResource, Match, Switch, type Component } from "solid-js";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { SchoolForm } from "../../components/director/SchoolForm";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";
import { directorService } from "../../services/director";

export const SchoolsPage: Component = () => {
  const { t } = useI18n();
  const [school, { refetch }] = createResource(() => directorService.getActiveSchool());

  return (
    <div>
      <PageHeader
        eyebrow={t("director.schools.eyebrow")}
        title={t("director.schools.title")}
        description={t("director.schools.description")}
      />

      <div class="mt-7 max-w-3xl rounded-3xl border border-line bg-white p-6 shadow-card sm:p-8">
        <Switch>
          <Match when={school.loading}>
            <div class="flex items-center justify-center p-12 text-ink-muted">
              <span class="grid size-10 animate-spin place-items-center rounded-full border-2 border-brand border-t-transparent text-brand" />
            </div>
          </Match>

          <Match when={school.error}>
            <div role="alert" class="rounded-2xl border border-danger/20 bg-danger-soft p-5 text-sm text-danger">
              {t("director.schools.loadError")}
            </div>
          </Match>

          <Match when={school()} keyed>
            {(activeSchool) => <SchoolForm school={activeSchool} onUpdated={() => refetch()} />}
          </Match>

          <Match when={!school.loading && !school.error && school() === null}>
            <div class="flex flex-col items-center px-4 py-12 text-center">
              <span class="grid size-12 place-items-center rounded-2xl bg-canvas text-ink-faint">
                <Icon name="school" class="size-6" />
              </span>
              <h2 class="mt-4 text-lg font-bold text-ink">{t("director.schools.emptyTitle")}</h2>
              <p class="mt-2 max-w-md text-sm leading-6 text-ink-muted">
                {t("director.schools.emptyDescription")}
              </p>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
};
