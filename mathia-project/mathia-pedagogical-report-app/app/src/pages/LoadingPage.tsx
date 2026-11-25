import type { Component } from "solid-js";

import { Logo } from "../components/brand/Logo";
import { useI18n } from "../lib/i18n";

export const LoadingPage: Component = () => {
  const { t } = useI18n();

  return (
    <main class="grid min-h-dvh place-items-center bg-canvas px-6 text-center">
      <div class="flex flex-col items-center">
        <Logo />
        <span class="mt-8 size-7 animate-spin rounded-full border-2 border-brand/15 border-t-brand" />
        <p class="mt-4 text-sm font-medium text-ink-muted">{t("app.loading")}</p>
      </div>
    </main>
  );
};
