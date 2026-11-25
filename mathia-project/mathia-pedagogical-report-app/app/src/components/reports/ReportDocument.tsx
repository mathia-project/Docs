import { For, Show, type Component } from "solid-js";
import type { ReportPresentation } from "../../services/report-document";

/** Read-only: plain text nodes, never HTML supplied by a model or a stored report. */
export const ReportDocument: Component<{ report: ReportPresentation }> = (props) => (
  <article lang={props.report.language} class="mx-auto max-w-3xl rounded-2xl border border-line bg-white p-5 text-ink shadow-card sm:p-10">
    <header class="border-b border-line pb-6">
      <p class="text-sm font-bold tracking-widest text-brand">MATHIA</p>
      <p class="mt-4 rounded-lg bg-canvas-soft p-3 text-sm font-semibold" role="status">
        {props.report.status_label}
      </p>
      <h2 class="mt-5 break-words text-2xl font-bold sm:text-3xl">{props.report.title}</h2>
      <dl class="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <For each={props.report.details}>{(detail) => (
          <div class="min-w-0">
            <dt class="text-xs font-semibold text-ink-muted">{detail.label}</dt>
            <dd class="mt-1 whitespace-pre-wrap break-words">{detail.value}</dd>
          </div>
        )}</For>
      </dl>
    </header>
    <For each={props.report.sections}>{(section) => (
      <section class="mt-7">
        <h3 class="text-lg font-bold text-brand">{section.title}</h3>
        <div class="mt-3 space-y-4">
          <For each={section.blocks}>{(block) => (
            <div class="min-w-0 text-sm leading-6">
              <Show when={block.label}><p class="font-bold">{block.label}</p></Show>
              <p class="whitespace-pre-wrap [overflow-wrap:anywhere]">{block.text}</p>
              <Show when={block.links.length}>
                <ul class="mt-2 list-inside list-disc space-y-1 text-xs text-ink-muted">
                  <For each={block.links}>{(link) => (
                    <li class="[overflow-wrap:anywhere]">
                      {link.title}
                      <Show when={link.url && /^https?:\/\//.test(link.url)}>
                        {": "}<a href={link.url!} target="_blank" rel="noopener noreferrer" class="text-brand underline">{link.url}</a>
                      </Show>
                    </li>
                  )}</For>
                </ul>
              </Show>
            </div>
          )}</For>
        </div>
      </section>
    )}</For>
  </article>
);
