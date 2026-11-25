import type { Component } from "solid-js";

import { cn } from "../../lib/cn";
import { useI18n } from "../../lib/i18n";
import { appConfig } from "../../services/config";

interface LogoProps {
  compact?: boolean;
  inverse?: boolean;
  class?: string;
}

export const Logo: Component<LogoProps> = (props) => {
  const { t } = useI18n();

  return (
    <div class={cn("flex items-center gap-3", props.class)}>
      <img
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        class="size-10 shrink-0 object-contain"
        width="40"
        height="40"
        alt=""
        aria-hidden="true"
      />
      <span class={cn("leading-none", props.compact && "sr-only")}>
        <span class={cn("block text-lg font-bold tracking-[-0.025em]", props.inverse && "text-white")}>
          {t("app.name")}
        </span>
        <span
          class={cn(
            "mt-1 block text-[0.66rem] font-semibold uppercase tracking-[0.18em]",
            props.inverse ? "text-white/55" : "text-ink-faint",
          )}
        >
          {appConfig.schoolName || t("app.brandDescriptor")}
        </span>
      </span>
    </div>
  );
};
