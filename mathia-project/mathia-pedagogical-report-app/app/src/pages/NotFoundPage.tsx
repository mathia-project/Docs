import { A } from "@solidjs/router";
import type { Component } from "solid-js";

import { Logo } from "../components/brand/Logo";
import { Icon } from "../components/ui/Icon";
import { useI18n } from "../lib/i18n";
import { defaultRouteForRole } from "../lib/roles";
import { useAuth } from "../stores/auth";

export const NotFoundPage: Component = () => {
  const auth = useAuth();
  const { t } = useI18n();
  const destination = (): string => {
    const user = auth.user;
    return user ? defaultRouteForRole(user.role) : "/login";
  };

  return (
    <main class="grid min-h-dvh place-items-center bg-canvas px-5 py-10">
      <section class="w-full max-w-xl rounded-3xl border border-line bg-white p-7 text-center shadow-card sm:p-10">
        <Logo class="mx-auto w-fit" />
        <p class="mt-10 text-7xl font-bold tracking-[-0.07em] text-brand/12">404</p>
        <p class="mt-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-accent">
          {t("notFound.eyebrow")}
        </p>
        <h1 class="mt-3 text-2xl font-bold tracking-[-0.035em] text-ink sm:text-3xl">
          {t("notFound.title")}
        </h1>
        <p class="mx-auto mt-4 max-w-md text-sm leading-6 text-ink-muted">
          {t("notFound.description")}
        </p>
        <A
          href={destination()}
          class="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t("notFound.action")}
          <Icon name="arrow-right" class="size-4" />
        </A>
      </section>
    </main>
  );
};
