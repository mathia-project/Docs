import { Navigate, useNavigate } from "@solidjs/router";
import { createMemo, createSignal, Match, Show, Switch, type Component, type JSX } from "solid-js";

import { Logo } from "../components/brand/Logo";
import { EuFunding } from "../components/brand/EuFunding";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { type Locale, useI18n } from "../lib/i18n";
import { defaultRouteForRole } from "../lib/roles";
import { buildStudentSyntheticEmail } from "../lib/student-auth";
import { useAuth } from "../stores/auth";
import { appConfig } from "../services/config";
import { LoadingPage } from "./LoadingPage";

const SCHOOL_CODE_STORAGE_KEY = "mathia.student.school_code";

export const LoginPage: Component = () => {
  const auth = useAuth();
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();

  const [loginMode, setLoginMode] = createSignal<"email" | "pin">("email");
  const [schoolCode, setSchoolCode] = createSignal(
    localStorage.getItem(SCHOOL_CODE_STORAGE_KEY) || appConfig.schoolCode,
  );
  const [studentCode, setStudentCode] = createSignal("");
  const [pin, setPin] = createSignal("");

  const authenticatedDestination = createMemo(() => {
    const user = auth.user;
    return user ? defaultRouteForRole(user.role) : "/";
  });
  const errorMessage = createMemo(() => {
    const error = auth.error;
    return error ? t(`auth.error.${error}`) : "";
  });

  const handleSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = async (event) => {
    event.preventDefault();

    try {
      let email: string;
      let password: string;

      if (loginMode() === "pin") {
        const cleanSchool = schoolCode().trim().toUpperCase();
        if (cleanSchool) {
          localStorage.setItem(SCHOOL_CODE_STORAGE_KEY, cleanSchool);
        }
        email = buildStudentSyntheticEmail(cleanSchool, studentCode().trim());
        password = pin().trim();
      } else {
        const formData = new FormData(event.currentTarget);
        email = String(formData.get("email") ?? "").trim();
        password = String(formData.get("password") ?? "");
      }

      const user = await auth.signIn({ email, password });
      navigate(defaultRouteForRole(user.role), { replace: true });
    } catch {
      // The auth store exposes a safe, translated error state.
    }
  };

  return (
    <Switch>
      <Match when={auth.status === "loading"}>
        <LoadingPage />
      </Match>
      <Match when={auth.status === "authenticated"}>
        <Navigate href={authenticatedDestination()} />
      </Match>
      <Match when={auth.status === "anonymous"}>
        <main class="min-h-dvh bg-canvas lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
          <section class="relative hidden min-h-dvh overflow-hidden bg-brand px-12 py-10 text-white lg:flex lg:flex-col xl:px-20 xl:py-14">
            <div class="absolute -left-32 bottom-[-13rem] size-[34rem] rounded-full border-[5rem] border-white/[0.035]" />
            <div class="absolute -right-40 top-20 size-96 rounded-full bg-amber/[0.07] blur-3xl" />
            <Logo inverse />

            <div class="relative my-auto max-w-2xl py-16">
              <p class="text-xs font-bold uppercase tracking-[0.2em] text-amber">
                {t("auth.eyebrow")}
              </p>
              <h1 class="mt-5 max-w-xl text-5xl font-bold leading-[1.06] tracking-[-0.05em] xl:text-6xl">
                {t("auth.title")}
              </h1>
              <p class="mt-6 max-w-xl text-base leading-7 text-white/67 xl:text-lg xl:leading-8">
                {t("auth.description")}
              </p>

              <ul class="mt-10 grid max-w-xl gap-4 text-sm leading-6 text-white/74">
                <li class="flex gap-3">
                  <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-amber/15 text-amber">
                    <Icon name="check" class="size-3.5" />
                  </span>
                  {t("auth.benefit.relational")}
                </li>
                <li class="flex gap-3">
                  <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-amber/15 text-amber">
                    <Icon name="check" class="size-3.5" />
                  </span>
                  {t("auth.benefit.focused")}
                </li>
              </ul>
            </div>
          </section>

          <section class="flex min-h-dvh flex-col px-5 py-5 sm:px-10 sm:py-8 lg:px-14 xl:px-20">
            <div class="flex items-center justify-between lg:justify-end">
              <Logo class="lg:hidden" />
              <label class="sr-only" for="login-locale-select">
                {t("nav.language")}
              </label>
              <select
                id="login-locale-select"
                class="min-h-10 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
                value={locale()}
                onChange={(event) => setLocale(event.currentTarget.value as Locale)}
              >
                <option value="en">{t("language.en")}</option>
                <option value="es">{t("language.es")}</option>
                <option value="it">{t("language.it")}</option>
              </select>
            </div>

            <div class="mx-auto flex w-full max-w-md flex-1 items-center py-12">
              <div class="w-full">
                <p class="text-xs font-bold uppercase tracking-[0.18em] text-brand-accent">
                  {t("app.name")}
                </p>
                <h2 class="mt-3 text-3xl font-bold tracking-[-0.04em] text-ink sm:text-4xl">
                  {t("auth.form.title")}
                </h2>
                <p class="mt-3 text-sm leading-6 text-ink-muted">{t("auth.form.description")}</p>

                <div class="mt-6 flex rounded-2xl bg-canvas p-1 border border-line">
                  <button
                    type="button"
                    class={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${
                      loginMode() === "email"
                        ? "bg-white text-ink shadow-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                    onClick={() => {
                      setLoginMode("email");
                      auth.clearError();
                    }}
                  >
                    {t("auth.tab.email")}
                  </button>
                  <button
                    type="button"
                    class={`flex-1 rounded-xl py-2.5 text-xs font-bold transition ${
                      loginMode() === "pin"
                        ? "bg-white text-ink shadow-sm"
                        : "text-ink-muted hover:text-ink"
                    }`}
                    onClick={() => {
                      setLoginMode("pin");
                      auth.clearError();
                    }}
                  >
                    {t("auth.tab.studentPin")}
                  </button>
                </div>

                <form class="mt-6 space-y-5" onSubmit={handleSubmit}>
                  <Show
                    when={loginMode() === "pin"}
                    fallback={
                      <>
                        <div>
                          <label class="mb-2 block text-sm font-semibold text-ink" for="email">
                            {t("auth.email")}
                          </label>
                          <input
                            id="email"
                            name="email"
                            type="email"
                            autocomplete="email"
                            required
                            class="min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink outline-none transition placeholder:text-ink-faint/65 focus:border-brand focus:ring-4 focus:ring-brand/8"
                            placeholder={t("auth.emailPlaceholder")}
                            onInput={auth.clearError}
                          />
                        </div>

                        <div>
                          <label class="mb-2 block text-sm font-semibold text-ink" for="password">
                            {t("auth.password")}
                          </label>
                          <input
                            id="password"
                            name="password"
                            type="password"
                            autocomplete="current-password"
                            required
                            class="min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink outline-none transition placeholder:text-ink-faint/65 focus:border-brand focus:ring-4 focus:ring-brand/8"
                            onInput={auth.clearError}
                          />
                        </div>
                      </>
                    }
                  >
                    <div>
                      <label class="mb-2 block text-sm font-semibold text-ink" for="schoolCode">
                        {t("auth.schoolCode")}
                      </label>
                      <input
                        id="schoolCode"
                        type="text"
                        required
                        value={schoolCode()}
                        onInput={(e) => {
                          setSchoolCode(e.currentTarget.value.toUpperCase());
                          auth.clearError();
                        }}
                        class="min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base uppercase font-mono tracking-wider text-ink outline-none transition placeholder:text-ink-faint/65 focus:border-brand focus:ring-4 focus:ring-brand/8"
                        placeholder={t("auth.schoolCodePlaceholder")}
                      />
                    </div>

                    <div>
                      <label class="mb-2 block text-sm font-semibold text-ink" for="studentCode">
                        {t("auth.studentCode")}
                      </label>
                      <input
                        id="studentCode"
                        type="text"
                        required
                        value={studentCode()}
                        onInput={(e) => {
                          setStudentCode(e.currentTarget.value);
                          auth.clearError();
                        }}
                        class="min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base text-ink outline-none transition placeholder:text-ink-faint/65 focus:border-brand focus:ring-4 focus:ring-brand/8"
                        placeholder={t("auth.studentCodePlaceholder")}
                      />
                    </div>

                    <div>
                      <label class="mb-2 block text-sm font-semibold text-ink" for="studentPin">
                        {t("auth.studentPin")}
                      </label>
                      <input
                        id="studentPin"
                        type="password"
                        inputMode="numeric"
                        required
                        value={pin()}
                        onInput={(e) => {
                          setPin(e.currentTarget.value);
                          auth.clearError();
                        }}
                        class="min-h-12 w-full rounded-xl border border-line bg-white px-4 text-base tracking-widest text-ink outline-none transition placeholder:text-ink-faint/65 focus:border-brand focus:ring-4 focus:ring-brand/8"
                        placeholder={t("auth.studentPinPlaceholder")}
                      />
                    </div>

                    <p class="text-xs text-ink-muted leading-relaxed">
                      {t("auth.studentPinHelp")}
                    </p>
                  </Show>

                  <Show when={auth.error}>
                    <div
                      role="alert"
                      class="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm leading-5 text-danger"
                    >
                      {errorMessage()}
                    </div>
                  </Show>

                  <Button class="w-full" type="submit" disabled={auth.isSubmitting}>
                    {auth.isSubmitting ? t("auth.submitting") : t("auth.submit")}
                    <Icon name="arrow-right" class="size-4" />
                  </Button>
                </form>

                <p class="mt-5 flex items-center justify-center gap-2 text-center text-xs text-ink-faint">
                  <Icon name="lock" class="size-3.5" />
                  {t("auth.securityNote")}
                </p>
              </div>
            </div>
            <EuFunding />
          </section>
        </main>
      </Match>
    </Switch>
  );
};
