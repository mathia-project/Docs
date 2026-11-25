import { createEffect, createSignal, For, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { extractErrorMessage } from "../../lib/errors";
import { useI18n } from "../../lib/i18n";
import {
  CANONICAL_COURSES,
  formatCourseOptionLabel,
  resolveCourseIdFromGrade,
} from "../../lib/curriculum";
import { directorService } from "../../services/director";
import type { ClassRecord } from "../../services/schema";

interface ClassFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (cls: ClassRecord) => void;
  initialData?: ClassRecord | null;
}

export const ClassForm: Component<ClassFormProps> = (props) => {
  const { t, locale } = useI18n();
  const [name, setName] = createSignal("");
  const [code, setCode] = createSignal("");
  const [academicYear, setAcademicYear] = createSignal("2025-2026");
  const [gradeLevel, setGradeLevel] = createSignal("");
  const [startsOn, setStartsOn] = createSignal("");
  const [endsOn, setEndsOn] = createSignal("");
  const [active, setActive] = createSignal(true);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  createEffect(() => {
    if (props.isOpen) {
      if (props.initialData) {
        setName(props.initialData.name || "");
        setCode(props.initialData.code || "");
        setAcademicYear(props.initialData.academic_year || "2025-2026");
        setGradeLevel(
          props.initialData.grade_level
            ? resolveCourseIdFromGrade(props.initialData.grade_level)
            : "",
        );
        setStartsOn(props.initialData.starts_on || "");
        setEndsOn(props.initialData.ends_on || "");
        setActive(props.initialData.active !== false);
      } else {
        setName("");
        setCode("");
        setAcademicYear("2025-2026");
        setGradeLevel("");
        setStartsOn("");
        setEndsOn("");
        setActive(true);
      }
      setErrorMessage(null);
    }
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let result: ClassRecord;
      if (props.initialData) {
        result = await directorService.updateClass(props.initialData.id, {
          name: name().trim(),
          code: code().trim(),
          academic_year: academicYear().trim(),
          grade_level: gradeLevel().trim() || null,
          starts_on: startsOn() || null,
          ends_on: endsOn() || null,
          active: active(),
        });
      } else {
        result = await directorService.createClass({
          name: name().trim(),
          code: code().trim(),
          academic_year: academicYear().trim(),
          grade_level: gradeLevel().trim() || null,
          starts_on: startsOn() || null,
          ends_on: endsOn() || null,
          active: active(),
        });
      }
      props.onSuccess(result);
      props.onClose();
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, t("common.error")));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={props.initialData ? t("common.edit") : t("director.classes.new")}
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} class="space-y-4">
        <Show when={errorMessage()}>
          <div class="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm font-semibold text-danger">
            {errorMessage()}
          </div>
        </Show>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.classes.name")}
          </label>
          <input
            type="text"
            required
            placeholder={t("director.classes.namePlaceholder")}
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("director.classes.code")}
            </label>
            <input
              type="text"
              required
              placeholder={t("director.classes.codePlaceholder")}
              value={code()}
              onInput={(e) => setCode(e.currentTarget.value)}
              class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("director.classes.academicYear")}
            </label>
            <input
              type="text"
              required
              placeholder="2025-2026"
              value={academicYear()}
              onInput={(e) => setAcademicYear(e.currentTarget.value)}
              class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.classes.gradeLevel")}
          </label>
          <select
            value={gradeLevel()}
            onChange={(e) => setGradeLevel(e.currentTarget.value)}
            class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          >
            <option value="">{t("director.classes.selectGradeLevel")}</option>
            <For each={CANONICAL_COURSES}>
              {(course) => (
                <option value={course.id}>
                  {formatCourseOptionLabel(course, locale())}
                </option>
              )}
            </For>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("director.classes.startsOn")}
            </label>
            <input
              type="date"
              value={startsOn()}
              onInput={(e) => setStartsOn(e.currentTarget.value)}
              class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </div>

          <div>
            <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
              {t("director.classes.endsOn")}
            </label>
            <input
              type="date"
              value={endsOn()}
              onInput={(e) => setEndsOn(e.currentTarget.value)}
              class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
            />
          </div>
        </div>

        <div class="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="class-active"
            checked={active()}
            onChange={(e) => setActive(e.currentTarget.checked)}
            class="size-4 rounded accent-brand"
          />
          <label for="class-active" class="text-sm font-semibold text-ink">
            {t("common.active")}
          </label>
        </div>

        <div class="flex justify-end gap-2.5 pt-4">
          <Button variant="secondary" type="button" onClick={props.onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={isSubmitting()}>
            {isSubmitting() ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
