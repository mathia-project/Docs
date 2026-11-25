import { createEffect, createSignal, For, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useI18n } from "../../lib/i18n";
import { formatCourseLabel } from "../../lib/curriculum";
import { directorService } from "../../services/director";
import { StudentBatchAssignmentForm } from "./StudentBatchAssignmentForm";
import type { ClassRecord, TeacherProfile } from "../../services/schema";

interface AssignmentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  type: "student" | "teacher";
  classes: ClassRecord[];
  teachers?: TeacherProfile[];
  preselectedClassId?: string;
}

export const AssignmentForm: Component<AssignmentFormProps> = (props) => (
  <Show when={props.type === "student"} fallback={<TeacherAssignmentForm {...props} />}>
    <StudentBatchAssignmentForm
      isOpen={props.isOpen}
      onClose={props.onClose}
      onSuccess={props.onSuccess}
      preselectedClassId={props.preselectedClassId}
    />
  </Show>
);

const TeacherAssignmentForm: Component<AssignmentFormProps> = (props) => {
  const { t, locale } = useI18n();
  const [selectedClassId, setSelectedClassId] = createSignal("");
  const [selectedTargetId, setSelectedTargetId] = createSignal("");
  const [date, setDate] = createSignal(new Date().toISOString().split("T")[0]!);
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  createEffect(() => {
    if (props.isOpen) {
      setSelectedClassId(props.preselectedClassId || (props.classes[0]?.id ?? ""));
      setSelectedTargetId(props.teachers?.[0]?.id ?? "");
      setDate(new Date().toISOString().split("T")[0]!);
      setErrorMessage(null);
    }
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!selectedClassId() || !selectedTargetId()) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await directorService.assignTeacherToClass({
        class_id: selectedClassId(),
        teacher_id: selectedTargetId(),
        assigned_on: date(),
      });
      props.onSuccess();
      props.onClose();
    } catch {
      setErrorMessage(t("common.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t("director.assignments.assignTeacher")}
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} class="space-y-4">
        <Show when={errorMessage()}>
          <div class="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm font-semibold text-danger">
            {errorMessage()}
          </div>
        </Show>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.assignments.selectClass")}
          </label>
          <select
            required
            value={selectedClassId()}
            onChange={(e) => setSelectedClassId(e.currentTarget.value)}
            class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          >
            <For each={props.classes}>
              {(cls) => (
                <option value={cls.id}>
                  {cls.name} ({cls.code})
                  {cls.grade_level ? ` • ${formatCourseLabel(cls.grade_level, locale())}` : ""} - {cls.academic_year}
                </option>
              )}
            </For>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.assignments.selectTeacher")}
          </label>
          <select
            required
            value={selectedTargetId()}
            onChange={(e) => setSelectedTargetId(e.currentTarget.value)}
            class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          >
            <For each={props.teachers || []}>
              {(tchr) => (
                <option value={tchr.id}>
                  {tchr.last_name}, {tchr.first_name} {tchr.email ? `(${tchr.email})` : ""}
                </option>
              )}
            </For>
          </select>
        </div>

        <div>
          <label class="block text-xs font-bold uppercase tracking-wider text-ink-muted">
            {t("director.assignments.assignedOn")}
          </label>
          <input
            type="date"
            required
            value={date()}
            onInput={(e) => setDate(e.currentTarget.value)}
            class="mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
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
