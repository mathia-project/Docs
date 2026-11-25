import { createEffect, createSignal, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { useI18n } from "../../lib/i18n";
import { directorService } from "../../services/director";
import type { EducationalSystem, School } from "../../services/schema";

interface SchoolFormProps {
  school: School;
  onUpdated?: (school: School) => void;
}

export const SchoolForm: Component<SchoolFormProps> = (props) => {
  const { t } = useI18n();
  const [name, setName] = createSignal("");
  const [code, setCode] = createSignal("");
  const [defaultLanguage, setDefaultLanguage] = createSignal("en");
  const [timeZone, setTimeZone] = createSignal("UTC");
  const [educationalSystem, setEducationalSystem] = createSignal<EducationalSystem>("ES");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [successMessage, setSuccessMessage] = createSignal<string | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  createEffect(() => {
    setName(props.school.name || "");
    setCode(props.school.code || "");
    setDefaultLanguage(props.school.default_language || "en");
    setTimeZone(props.school.time_zone || "UTC");
    setEducationalSystem(props.school.educational_system === "IT" ? "IT" : "ES");
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    const system = educationalSystem();
    if (system !== "ES" && system !== "IT") {
      setErrorMessage(t("common.error"));
      setIsSubmitting(false);
      return;
    }

    try {
      const updated = await directorService.updateSchool(props.school.id, {
        name: name().trim(),
        code: code().trim(),
        default_language: defaultLanguage(),
        time_zone: timeZone().trim(),
        educational_system: system,
      });
      setSuccessMessage(t("director.schools.updated"));
      props.onUpdated?.(updated);
    } catch {
      setErrorMessage(t("common.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} class="space-y-6">
      <Show when={successMessage()}>
        <div class="rounded-2xl border border-brand/20 bg-brand-soft p-4 text-sm font-semibold text-brand-strong">
          {successMessage()}
        </div>
      </Show>

      <Show when={errorMessage()}>
        <div class="rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm font-semibold text-danger">
          {errorMessage()}
        </div>
      </Show>

      <div class="grid gap-5 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.schools.name")}
          </label>
          <input
            type="text"
            required
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            class="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.schools.code")}
          </label>
          <input
            type="text"
            required
            value={code()}
            onInput={(e) => setCode(e.currentTarget.value)}
            class="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.schools.slug")}
          </label>
          <input
            type="text"
            disabled
            value={props.school.slug}
            class="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-canvas px-3 text-sm text-ink-muted cursor-not-allowed"
          />
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.schools.language")}
          </label>
          <select
            value={defaultLanguage()}
            onChange={(e) => setDefaultLanguage(e.currentTarget.value)}
            class="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          >
            <option value="en">{t("language.en")}</option>
            <option value="es">{t("language.es")}</option>
            <option value="it">{t("language.it")}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.schools.timezone")}
          </label>
          <input
            type="text"
            required
            value={timeZone()}
            onInput={(e) => setTimeZone(e.currentTarget.value)}
            class="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.schools.educationalSystem")}
          </label>
          <select
            required
            value={educationalSystem()}
            onChange={(e) => {
              const val = e.currentTarget.value;
              if (val === "ES" || val === "IT") {
                setEducationalSystem(val);
              }
            }}
            class="mt-1.5 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          >
            <option value="ES">{t("director.schools.educationalSystemEs")}</option>
            <option value="IT">{t("director.schools.educationalSystemIt")}</option>
          </select>
        </div>
      </div>

      <div class="flex justify-end pt-2">
        <Button type="submit" disabled={isSubmitting()}>
          {isSubmitting() ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </form>
  );
};
