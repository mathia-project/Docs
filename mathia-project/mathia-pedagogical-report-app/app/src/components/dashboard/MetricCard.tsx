import type { Component } from "solid-js";

import { Icon, type IconName } from "../ui/Icon";

interface MetricCardProps {
  icon: IconName;
  title: string;
  value: string;
  help: string;
}

export const MetricCard: Component<MetricCardProps> = (props) => (
  <article class="rounded-2xl border border-line bg-white p-5 shadow-card">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-sm font-semibold text-ink-muted">{props.title}</p>
        <p class="mt-2 text-2xl font-bold tracking-[-0.03em] text-ink">{props.value}</p>
      </div>
      <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon name={props.icon} class="size-5" />
      </span>
    </div>
    <p class="mt-5 border-t border-line pt-4 text-xs leading-5 text-ink-faint">{props.help}</p>
  </article>
);
