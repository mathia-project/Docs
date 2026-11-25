import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { Icon } from "../ui/Icon";
import { useI18n } from "../../lib/i18n";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T) => JSX.Element;
  class?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onView?: (item: T) => void;
  emptyMessage?: string;
  isLoading?: boolean;
  searchQuery?: string;
  filterFn?: (item: T, query: string) => boolean;
}

export function DataTable<T extends Record<string, any>>(props: DataTableProps<T>) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = createSignal<string | null>(null);
  const [sortAsc, setSortAsc] = createSignal(true);

  const filteredData = createMemo(() => {
    let list = props.data || [];
    const query = (props.searchQuery || "").trim().toLowerCase();

    if (query) {
      if (props.filterFn) {
        list = list.filter((item) => props.filterFn!(item, query));
      } else {
        list = list.filter((item) =>
          Object.values(item).some((val) =>
            val !== null && val !== undefined && String(val).toLowerCase().includes(query),
          ),
        );
      }
    }

    const initialSortKey = sortKey();
    const initialSortAsc = sortAsc();
    if (initialSortKey) {
      list = [...list].sort((a, b) => {
        const valA = a[initialSortKey] ?? "";
        const valB = b[initialSortKey] ?? "";
        if (valA < valB) return initialSortAsc ? -1 : 1;
        if (valA > valB) return initialSortAsc ? 1 : -1;
        return 0;
      });
    }

    return list;
  });

  const handleSort = (key: string) => {
    if (sortKey() === key) {
      setSortAsc(!sortAsc());
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const hasActions = () => Boolean(props.onEdit || props.onDelete || props.onView);

  return (
    <div class="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
      <Show
        when={!props.isLoading}
        fallback={
          <div class="flex flex-col items-center justify-center p-12 text-center text-ink-muted">
            <span class="grid size-10 animate-spin place-items-center rounded-full border-2 border-brand border-t-transparent text-brand" />
            <p class="mt-4 text-sm font-semibold">{t("common.loading")}</p>
          </div>
        }
      >
        <Show
          when={filteredData().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center p-12 text-center">
              <span class="grid size-12 place-items-center rounded-2xl bg-canvas text-ink-faint">
                <Icon name="search" class="size-6" />
              </span>
              <p class="mt-4 text-base font-semibold text-ink">
                {props.searchQuery ? t("common.noResults") : props.emptyMessage || t("common.noResults")}
              </p>
            </div>
          }
        >
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm text-ink">
              <thead class="border-b border-line bg-canvas-soft text-xs font-bold uppercase tracking-wider text-ink-muted">
                <tr>
                  <For each={props.columns}>
                    {(col) => (
                      <th
                        scope="col"
                        class={`px-6 py-4 ${col.class || ""}`}
                        onClick={() => col.sortable && handleSort(col.key)}
                      >
                        <div
                          class={`flex items-center gap-1.5 ${
                            col.sortable ? "cursor-pointer select-none hover:text-brand" : ""
                          }`}
                        >
                          <span>{col.header}</span>
                          <Show when={col.sortable && sortKey() === col.key}>
                            <span class="text-brand">{sortAsc() ? "▲" : "▼"}</span>
                          </Show>
                        </div>
                      </th>
                    )}
                  </For>
                  <Show when={hasActions()}>
                    <th scope="col" class="px-6 py-4 text-right">
                      {t("common.actions")}
                    </th>
                  </Show>
                </tr>
              </thead>
              <tbody class="divide-y divide-line/60">
                <For each={filteredData()}>
                  {(item) => (
                    <tr class="transition-colors hover:bg-canvas-soft/70">
                      <For each={props.columns}>
                        {(col) => (
                          <td class={`px-6 py-4 ${col.class || ""}`}>
                            {col.render ? col.render(item) : String(item[col.key] ?? "-")}
                          </td>
                        )}
                      </For>
                      <Show when={hasActions()}>
                        <td class="px-6 py-4 text-right">
                          <div class="flex items-center justify-end gap-1.5">
                            <Show when={props.onView}>
                              <button
                                type="button"
                                class="grid size-8 place-items-center rounded-lg text-ink-muted transition hover:bg-brand-soft hover:text-brand"
                                onClick={() => props.onView!(item)}
                                title={t("common.details")}
                              >
                                <Icon name="chevron-right" class="size-4" />
                              </button>
                            </Show>
                            <Show when={props.onEdit}>
                              <button
                                type="button"
                                class="grid size-8 place-items-center rounded-lg text-ink-muted transition hover:bg-brand-soft hover:text-brand"
                                onClick={() => props.onEdit!(item)}
                                title={t("common.edit")}
                              >
                                <Icon name="pencil" class="size-4" />
                              </button>
                            </Show>
                            <Show when={props.onDelete}>
                              <button
                                type="button"
                                class="grid size-8 place-items-center rounded-lg text-ink-muted transition hover:bg-danger-soft hover:text-danger"
                                onClick={() => props.onDelete!(item)}
                                title={t("common.delete")}
                              >
                                <Icon name="trash" class="size-4" />
                              </button>
                            </Show>
                          </div>
                        </td>
                      </Show>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </div>
  );
}
