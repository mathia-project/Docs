import type { Component } from "solid-js";

import { useI18n } from "../../lib/i18n";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
}

export const PageHeader: Component<PageHeaderProps> = (props) => {
  const { t } = useI18n();

  return (
    <header class="flex flex-col gap-5 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div class="max-w-2xl">
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-brand-accent">{props.eyebrow}</p>
        <h1 class="mt-2 text-3xl font-bold tracking-[-0.04em] text-ink sm:text-4xl">{props.title}</h1>
        <p class="mt-3 max-w-xl text-sm leading-6 text-ink-muted sm:text-base">{props.description}</p>
      </div>
      <span class="inline-flex w-fit items-center gap-2 rounded-full border border-amber/35 bg-amber-soft px-3 py-1.5 text-xs font-bold text-brand-strong">
        <span class="size-1.5 rounded-full bg-brand-orange" />
        {t("app.foundationStatus")}
      </span>
    </header>
  );
};
