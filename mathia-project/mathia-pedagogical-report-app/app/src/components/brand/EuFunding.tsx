import type { Component } from "solid-js";

import { useI18n } from "../../lib/i18n";

export const EuFunding: Component = () => {
  const { t } = useI18n();

  return (
    <footer class="mx-auto w-full max-w-md border-t border-line pt-6">
      <p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {t("funding.label")}
      </p>
      <div class="mt-4 flex items-center gap-4 bg-white p-3">
        <img
          src={`${import.meta.env.BASE_URL}eu-flag.svg`}
          alt={t("funding.emblemAlt")}
          width="96"
          height="64"
          class="h-16 w-24 shrink-0 object-contain"
        />
        <p class="text-lg font-bold leading-tight text-eu-blue">
          {t("funding.statement")}
        </p>
      </div>
      <p class="mt-4 text-xs font-semibold uppercase leading-5 text-ink-muted">
        {t("funding.programme")}
      </p>
    </footer>
  );
};
