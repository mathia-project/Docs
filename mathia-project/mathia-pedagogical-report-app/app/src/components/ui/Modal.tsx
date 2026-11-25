import { onCleanup, onMount, Show, type Component, type JSX } from "solid-js";
import { Icon } from "./Icon";
import { cn } from "../../lib/cn";
import { useI18n } from "../../lib/i18n";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: JSX.Element;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
}

const maxWidthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
};

export const Modal: Component<ModalProps> = (props) => {
  const { t } = useI18n();
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.isOpen) {
      props.onClose();
    }
  };

  onMount(() => {
    window.addEventListener("keydown", handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <Show when={props.isOpen}>
      <div
        class="fixed inset-0 z-50 overflow-y-auto bg-ink/50 p-3 backdrop-blur-xs transition-opacity sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={props.title ? "modal-title" : undefined}
      >
        <div
          class="flex min-h-full items-center justify-center p-0 text-center sm:p-2"
          onClick={(e) => {
            if (e.target === e.currentTarget) props.onClose();
          }}
        >
          <div
            class={cn(
              "relative my-auto flex max-h-[calc(100dvh-1.5rem)] w-full flex-col rounded-3xl border border-line bg-white p-5 text-left shadow-2xl transition-all sm:max-h-[calc(100dvh-3rem)] sm:p-7",
              maxWidthMap[props.maxWidth ?? "lg"],
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex shrink-0 items-start justify-between gap-4 border-b border-line/60 pb-4">
              <div>
                <Show when={props.title}>
                  <h3 id="modal-title" class="text-lg font-bold tracking-tight text-ink sm:text-xl">
                    {props.title}
                  </h3>
                </Show>
                <Show when={props.description}>
                  <p class="mt-1 text-sm text-ink-muted">{props.description}</p>
                </Show>
              </div>
              <button
                type="button"
                class="grid size-9 shrink-0 place-items-center rounded-xl text-ink-muted transition hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
                onClick={() => props.onClose()}
                aria-label={t("common.close")}
              >
                <Icon name="x" class="size-5" />
              </button>
            </div>

            <div class="mt-4 flex-1 overflow-y-auto pr-1 pb-2 overscroll-contain">
              {props.children}
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
};
