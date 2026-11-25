import { createEffect, createSignal, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { useI18n } from "../../lib/i18n";
import { testBuilderService } from "../../services/test-builder";
import type { TestRecord } from "../../services/schema";

interface Props {
  isOpen: boolean;
  testToEdit?: TestRecord | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const TestFormModal: Component<Props> = (props) => {
  const { t, locale } = useI18n();
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [instructions, setInstructions] = createSignal("");
  const [durationMinutes, setDurationMinutes] = createSignal<number | "">("");
  const [maxAttempts, setMaxAttempts] = createSignal(1);
  const [language, setLanguage] = createSignal<string>(locale());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  createEffect(() => {
    if (props.isOpen) {
      if (props.testToEdit) {
        setTitle(props.testToEdit.title || "");
        setDescription(props.testToEdit.description || "");
        instructionsSignalSync(props.testToEdit.instructions || "");
        setDurationMinutes(props.testToEdit.duration_minutes ?? "");
        setMaxAttempts(props.testToEdit.max_attempts ?? 1);
        setLanguage(props.testToEdit.language);
      } else {
        setTitle("");
        setDescription("");
        setInstructions("");
        setDurationMinutes("");
        setMaxAttempts(1);
        setLanguage(locale());
      }
      setError(null);
    }
  });

  function instructionsSignalSync(val: string) {
    setInstructions(val);
  }

  const isEditing = () => Boolean(props.testToEdit);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!title().trim()) {
      setError(t("tests.form.name") + " is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (props.testToEdit) {
        await testBuilderService.updateTest(props.testToEdit.id, {
          title: title().trim(),
          description: description().trim() || null,
          instructions: instructions().trim() || null,
          duration_minutes: durationMinutes() ? Number(durationMinutes()) : null,
          max_attempts: Number(maxAttempts()) || 1,
          language: language(),
        });
      } else {
        await testBuilderService.createTest({
          title: title().trim(),
          description: description().trim() || null,
          instructions: instructions().trim() || null,
          duration_minutes: durationMinutes() ? Number(durationMinutes()) : null,
          max_attempts: Number(maxAttempts()) || 1,
          language: language(),
        });
      }
      props.onSuccess();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
        <div class="w-full max-w-lg rounded-2xl border border-line bg-white p-6 shadow-xl">
          <div class="flex items-center justify-between border-b border-line pb-4">
            <h3 class="text-lg font-bold text-ink">
              {isEditing() ? t("tests.form.editTitle") : t("tests.form.title")}
            </h3>
            <button
              type="button"
              onClick={() => props.onClose()}
              class="rounded-lg p-1 text-ink-muted hover:bg-canvas hover:text-ink"
            >
              <Icon name="x" class="size-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} class="mt-4 space-y-4">
            <Show when={error()}>
              <div class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error()}
              </div>
            </Show>

            <div>
              <label class="block text-xs font-bold text-ink">{t("tests.form.name")}</label>
              <input
                type="text"
                required
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder={t("tests.form.namePlaceholder")}
                class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-ink">{t("tests.form.description")}</label>
              <textarea
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                rows={2}
                class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>

            <div>
              <label class="block text-xs font-bold text-ink">{t("nav.language")}</label>
              <select
                value={language()}
                onChange={(event) => setLanguage(event.currentTarget.value)}
                class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              >
                <option value="en">{t("language.en")}</option>
                <option value="es">{t("language.es")}</option>
                <option value="it">{t("language.it")}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-bold text-ink">{t("tests.form.instructions")}</label>
              <textarea
                value={instructions()}
                onInput={(e) => setInstructions(e.currentTarget.value)}
                rows={2}
                placeholder={t("tests.form.instructionsPlaceholder")}
                class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-bold text-ink">{t("tests.form.duration")}</label>
                <input
                  type="number"
                  min="1"
                  value={durationMinutes()}
                  onInput={(e) => setDurationMinutes(e.currentTarget.value ? Number(e.currentTarget.value) : "")}
                  placeholder="45"
                  class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              </div>

              <div>
                <label class="block text-xs font-bold text-ink">{t("tests.form.maxAttempts")}</label>
                <input
                  type="number"
                  min="1"
                  value={maxAttempts()}
                  onInput={(e) => setMaxAttempts(Number(e.currentTarget.value) || 1)}
                  class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              </div>
            </div>

            <div class="mt-6 flex justify-end gap-3 pt-4 border-t border-line">
              <Button variant="secondary" type="button" onClick={props.onClose}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={loading()}>
                {loading() ? t("common.saving") : isEditing() ? t("common.save") : t("common.create")}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Show>
  );
};
