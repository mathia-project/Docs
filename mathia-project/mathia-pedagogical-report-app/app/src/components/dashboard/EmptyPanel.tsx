import type { Component } from "solid-js";

import { Icon, type IconName } from "../ui/Icon";

interface EmptyPanelProps {
  icon: IconName;
  title: string;
  description: string;
}

export const EmptyPanel: Component<EmptyPanelProps> = (props) => (
  <section class="relative overflow-hidden rounded-3xl border border-brand/12 bg-brand p-6 text-white shadow-card sm:p-8">
    <div class="absolute -right-12 -top-16 size-48 rounded-full bg-amber/10 blur-sm" />
    <div class="relative flex max-w-2xl flex-col items-start gap-5 sm:flex-row">
      <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-amber">
        <Icon name={props.icon} class="size-6" />
      </span>
      <div>
        <h2 class="text-xl font-bold tracking-[-0.025em]">{props.title}</h2>
        <p class="mt-2 text-sm leading-6 text-white/70">{props.description}</p>
      </div>
    </div>
  </section>
);
