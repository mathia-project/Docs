import { createMemo, Show, type Component } from "solid-js";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { MarkdownContent } from "../ui/MarkdownContent";
import { formatDomainName } from "../../lib/curriculum";
import { useI18n } from "../../lib/i18n";
import type { Resource } from "../../services/schema";
import { SearchAttribution } from "./SearchAttribution";

interface ResourceViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  resource: Resource | null;
}

export const ResourceViewerModal: Component<ResourceViewerModalProps> = (props) => {
  const { t, locale } = useI18n();

  const youtubeEmbedUrl = createMemo(() => {
    const rawUrl = props.resource?.url;
    if (!rawUrl) return null;
    try {
      const parsed = new URL(rawUrl);
      if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(parsed.hostname) && /^[\w-]{11}$/.test(parsed.searchParams.get("v") || "")) {
        return `https://www.youtube-nocookie.com/embed/${parsed.searchParams.get("v")}`;
      }
      if (parsed.hostname === "youtu.be" && /^\/[\w-]{11}$/.test(parsed.pathname)) {
        return `https://www.youtube-nocookie.com/embed${parsed.pathname}`;
      }
    } catch {
      return null;
    }
    return null;
  });

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={props.resource?.title || t("resources.viewer.title")}
      maxWidth="3xl"
    >
      <Show when={props.resource}>
        {(res) => (
          <div class="flex flex-col pr-1 text-left space-y-4">
            {/* Meta Tags */}
            <div class="flex flex-wrap items-center gap-2">
              <Show when={res().domain_id}>
                <span class="inline-flex items-center rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                  {formatDomainName(res().domain_id, locale())}
                </span>
              </Show>

              <span class="inline-flex items-center rounded-lg bg-surface-alt px-2.5 py-1 text-xs font-semibold text-muted">
                {t(`backpack.type.${res().resource_type}` as any)}
              </span>

              <Show when={res().target_level}>
                <span
                  class={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ${
                    res().target_level === "reinforcement"
                      ? "bg-amber-100 text-amber-800"
                      : res().target_level === "enrichment"
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {t(`backpack.level.${res().target_level}` as any)}
                </span>
              </Show>
            </div>

            {/* Description */}
            <Show when={res().description}>
              <p class="text-sm text-muted leading-relaxed">
                {res().description}
              </p>
            </Show>

            {/* Video Player */}
            <Show when={youtubeEmbedUrl()}>
              <div class="overflow-hidden rounded-2xl border border-line aspect-video w-full bg-black">
                <iframe
                  src={youtubeEmbedUrl()!}
                  title={res().title}
                  class="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                />
              </div>
            </Show>

            {/* External URL action if not video or in addition to video */}
            <Show when={res().url}>
              <div class="rounded-2xl border border-line bg-surface p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-xs font-semibold text-muted uppercase tracking-wider">
                    {t("backpack.type.link")}
                  </p>
                  <p class="truncate text-sm font-medium text-ink font-mono mt-0.5">
                    {res().url}
                  </p>
                </div>
                <a
                  href={res().url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-hover transition"
                >
                  <Icon name="link" class="size-4" />
                  {t("backpack.resource.open")}
                </a>
              </div>
            </Show>

            <SearchAttribution generation={res().metadata?.generation} />

            {/* Markdown Body Content */}
            <Show when={res().body}>
              <div class="min-w-0 rounded-2xl border border-line bg-surface p-5 text-sm text-ink font-sans">
                <MarkdownContent content={res().body!} />
              </div>
            </Show>

            {/* Footer */}
            <div class="flex justify-end pt-4 border-t border-line">
              <Button variant="secondary" onClick={props.onClose}>
                {t("backpack.modal.close")}
              </Button>
            </div>
          </div>
        )}
      </Show>
    </Modal>
  );
};
