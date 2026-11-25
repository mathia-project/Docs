import { A, useNavigate } from "@solidjs/router";
import { createMemo, For, type ParentComponent } from "solid-js";

import { Logo } from "../components/brand/Logo";
import { Icon, type IconName } from "../components/ui/Icon";
import { type Locale, useI18n } from "../lib/i18n";
import type { TranslationKey } from "../locales/en";
import type { AppRole } from "../lib/roles";
import { useAuth } from "../stores/auth";

interface NavigationItem {
  href: string;
  label: TranslationKey;
  icon: IconName;
  end?: boolean;
}

function navigationForRole(role: AppRole | undefined): NavigationItem[] {
  if (role === "student") {
    return [
      { href: "/student", label: "nav.dashboard", icon: "dashboard", end: true },
      { href: "/student/backpack", label: "nav.backpack", icon: "backpack" },
    ];
  }

  if (role === "teacher") {
    return [
      { href: "/teacher", label: "nav.dashboard", icon: "dashboard", end: true },
      { href: "/teacher/classes", label: "nav.classes", icon: "class" },
      { href: "/teacher/tests", label: "nav.tests", icon: "report" },
      { href: "/teacher/questions", label: "nav.questions", icon: "book" },
      { href: "/teacher/resources", label: "nav.resources", icon: "book" },
    ];
  }

  if (role === "director") {
    return [
      { href: "/director", label: "nav.dashboard", icon: "dashboard", end: true },
      { href: "/director/classes", label: "nav.classes", icon: "class" },
      { href: "/director/students", label: "nav.students", icon: "students" },
      { href: "/director/teachers", label: "nav.teachers", icon: "user" },
      { href: "/director/assignments", label: "nav.assignments", icon: "book" },
      { href: "/director/tests", label: "nav.tests", icon: "report" },
      { href: "/director/questions", label: "nav.questions", icon: "book" },
      { href: "/director/resources", label: "nav.resources", icon: "book" },
      { href: "/director/schools", label: "nav.schools", icon: "school" },
      { href: "/teacher", label: "nav.teaching", icon: "report", end: true },
    ];
  }

  return [];
}

export const AppLayout: ParentComponent = (props) => {
  const auth = useAuth();
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();
  const navigation = createMemo(() => navigationForRole(auth.user?.role));
  const displayName = createMemo(() => {
    const user = auth.user;
    if (!user) return "";
    return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
  });
  const roleLabel = createMemo(() => {
    const role = auth.user?.role;
    return role ? t(`role.${role}`) : "";
  });

  const handleSignOut = async (): Promise<void> => {
    try {
      await auth.signOut();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  const navigationLinks = () => (
    <For each={navigation()}>
      {(item) => (
        <A
          href={item.href}
          end={item.end}
          class="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/65 transition-colors hover:bg-white/8 hover:text-white"
          activeClass="!bg-white/12 !text-white"
        >
          <Icon name={item.icon} class="size-[1.1rem]" />
          {t(item.label)}
        </A>
      )}
    </For>
  );

  return (
    <div class="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a
        href="#main-content"
        class="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white focus:translate-y-0"
      >
        {t("app.skipToContent")}
      </a>

      <aside class="sticky top-0 hidden h-dvh flex-col bg-brand px-5 py-6 lg:flex">
        <A href="/" class="w-fit rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          <Logo inverse />
        </A>
        <nav class="mt-10 flex flex-col gap-1" aria-label={t("nav.primary")}>
          {navigationLinks()}
        </nav>
        <div class="mt-auto border-t border-white/10 pt-5">
          <div class="flex items-center gap-3">
            <span class="grid size-10 shrink-0 place-items-center rounded-full bg-amber/15 text-amber">
              <Icon name="user" class="size-5" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-white">{displayName()}</p>
              <p class="mt-0.5 text-xs text-white/50">{roleLabel()}</p>
            </div>
          </div>
          <button
            type="button"
            class="mt-4 min-h-10 w-full rounded-xl px-3 text-left text-sm font-semibold text-white/60 transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            onClick={() => void handleSignOut()}
          >
            {t("nav.signOut")}
          </button>
        </div>
      </aside>

      <div class="min-w-0">
        <header class="sticky top-0 z-30 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-10">
          <div class="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div class="lg:hidden">
              <Logo compact />
            </div>

            <p class="hidden text-sm font-semibold text-ink-muted lg:block">{t("app.tagline")}</p>

            <div class="flex items-center gap-2 sm:gap-3">
              <label class="sr-only" for="locale-select">
                {t("nav.language")}
              </label>
              <select
                id="locale-select"
                class="min-h-10 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
                value={locale()}
                onChange={(event) => setLocale(event.currentTarget.value as Locale)}
              >
                <option value="en">{t("language.en")}</option>
                <option value="es">{t("language.es")}</option>
                <option value="it">{t("language.it")}</option>
              </select>

              <details class="group relative lg:hidden">
                <summary class="grid min-h-10 min-w-10 cursor-pointer list-none place-items-center rounded-xl border border-line bg-white text-ink-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
                  <span class="sr-only">{t("nav.openMenu")}</span>
                  <Icon name="menu" class="size-5" />
                </summary>
                <div class="absolute right-0 top-12 w-64 rounded-2xl border border-line bg-brand p-3 shadow-xl">
                  <nav class="flex flex-col gap-1" aria-label={t("nav.primary")}>
                    {navigationLinks()}
                  </nav>
                  <div class="mt-3 border-t border-white/10 px-3 pt-3">
                    <p class="truncate text-sm font-semibold text-white">{displayName()}</p>
                    <p class="mt-0.5 text-xs text-white/50">{roleLabel()}</p>
                    <button
                      type="button"
                      class="mt-3 min-h-10 w-full rounded-lg text-left text-sm font-semibold text-white/65 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
                      onClick={() => void handleSignOut()}
                    >
                      {t("nav.signOut")}
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </header>

        <main id="main-content" class="mx-auto w-full max-w-7xl px-4 py-7 sm:px-6 sm:py-9 lg:px-10 lg:py-10">
          {props.children}
        </main>
      </div>
    </div>
  );
};
