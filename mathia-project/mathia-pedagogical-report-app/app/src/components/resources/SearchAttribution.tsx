import { createMemo, For, Show, type Component } from "solid-js";
import { useI18n } from "../../lib/i18n";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export const SearchAttribution: Component<{ generation: unknown }> = (props) => {
  const { t } = useI18n();
  const search = createMemo(() => record(record(props.generation)?.search));
  const sources = createMemo(() => {
    const results = search()?.results;
    return Array.isArray(results) ? results.flatMap((value) => {
      const item = record(value);
      if (typeof item?.url !== "string" || !/^https:\/\//.test(item.url)) return [];
      return [{ url: item.url, title: String(item.title || item.url) }];
    }) : [];
  });
  const suggestions = createMemo(() => {
    const html = search()?.search_entry_point;
    if (typeof html !== "string" || !html.trim()) return undefined;
    // Opaque origin, no scripts or same-origin privileges. Google's HTML/CSS
    // remains unchanged; its styles are confined to this document.
    const policy = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";
    return `data:text/html;charset=utf-8,${encodeURIComponent(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}">${html}`,
    )}`;
  });

  return (
    <Show when={search()?.provider === "google_grounding"}>
      <aside class="min-w-0 space-y-2 rounded-xl border border-line bg-canvas-soft p-3 text-xs">
        <p class="font-semibold text-ink">{t("resources.search.sources")}</p>
        <ul class="space-y-1">
          <For each={sources()}>{(source) => (
            <li class="break-words">
              <a class="text-brand-strong underline underline-offset-2" href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
            </li>
          )}</For>
        </ul>
        <Show when={suggestions()}>
          <iframe
            src={suggestions()}
            title={t("resources.search.suggestions")}
            sandbox="allow-popups allow-popups-to-escape-sandbox"
            referrerpolicy="no-referrer"
            class="h-40 w-full border-0"
          />
        </Show>
      </aside>
    </Show>
  );
};
