import { Show, type Component, type JSX } from "solid-js";
import { Icon } from "../ui/Icon";
import { useI18n } from "../../lib/i18n";

export interface ActionBarProps {
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  children?: JSX.Element;
}

export const ActionBar: Component<ActionBarProps> = (props) => {
  const { t } = useI18n();

  return (
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Show when={props.onSearchChange !== undefined}>
        <div class="relative min-w-0 flex-1 sm:max-w-xs">
          <span class="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-muted">
            <Icon name="search" class="size-4" />
          </span>
          <input
            type="search"
            value={props.searchValue || ""}
            onInput={(e) => props.onSearchChange!(e.currentTarget.value)}
            placeholder={props.searchPlaceholder || t("common.search")}
            class="min-h-10 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>
      </Show>
      <div class="flex flex-wrap items-center gap-2.5 sm:ml-auto">
        {props.children}
      </div>
    </div>
  );
};
