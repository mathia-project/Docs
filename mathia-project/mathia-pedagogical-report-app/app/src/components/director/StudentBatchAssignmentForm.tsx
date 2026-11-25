import { createEffect, createMemo, createResource, createSignal, For, on, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useI18n } from "../../lib/i18n";
import { formatCourseLabel } from "../../lib/curriculum";
import { getEnrollmentCandidates } from "../../lib/student-enrollment";
import { directorService } from "../../services/director";

interface StudentBatchAssignmentFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedClassId?: string | undefined;
}

export const StudentBatchAssignmentForm: Component<StudentBatchAssignmentFormProps> = (props) => {
  const { t, locale } = useI18n();
  const [classId, setClassId] = createSignal("");
  const [search, setSearch] = createSignal("");
  const [unassignedOnly, setUnassignedOnly] = createSignal(true);
  const [batchSize, setBatchSize] = createSignal(25);
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [date, setDate] = createSignal("");
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [success, setSuccess] = createSignal("");
  const [data, { refetch }] = createResource(() => props.isOpen, async () => {
    const [classes, students, assignments] = await Promise.all([
      directorService.getClasses(), directorService.getStudents(), directorService.getClassStudents(),
    ]);
    return { classes, students, assignments };
  });

  createEffect(on(() => props.isOpen, (open) => {
    if (!open) return;
    setClassId(props.preselectedClassId ?? "");
    setSearch("");
    setUnassignedOnly(true);
    setBatchSize(25);
    setSelectedIds([]);
    setDate(new Date().toISOString().split("T")[0]!);
    setError("");
    setSuccess("");
  }));

  const activeClasses = createMemo(() => data.error ? [] : data()?.classes.filter((item) => item.active) ?? []);
  const candidates = createMemo(() => {
    const current = data.error ? undefined : data();
    return current ? getEnrollmentCandidates(current.students, current.classes, current.assignments,
      classId(), unassignedOnly(), search()) : [];
  });
  const selection = createMemo(() => {
    const initialIds = new Set(selectedIds());
    return candidates().filter((student) => initialIds.has(student.id));
  });
  const ready = () => !data.loading && !data.error && !submitting();
  const close = () => { if (!submitting()) props.onClose(); };
  const handleReload = async () => {
    try { await refetch(); setError(""); } catch { setError(t("director.assignments.loadError")); }
  };

  const handleSubmit = async (event: Event) => {
    event.preventDefault();
    if (!ready() || !classId() || !selection().length) return;
    const ids = selection().map((student) => student.id);
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await directorService.assignStudentsToClass({ class_id: classId(), student_ids: ids, enrolled_on: date() });
      setSelectedIds([]);
      setSuccess(t("director.assignments.batchSuccess", { count: ids.length }));
      props.onSuccess();
    } catch {
      setError(t("director.assignments.batchError"));
      props.onSuccess();
    } finally {
      // Refresh even on failure: a previous batch request may already have succeeded.
      try { await refetch(); } catch { setError(t("director.assignments.loadError")); }
      setSubmitting(false);
    }
  };

  const inputClass = "mt-1 min-h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand focus:ring-2 focus:ring-brand/10";

  return (
    <Modal isOpen={props.isOpen} onClose={close} title={t("director.assignments.batchTitle")} maxWidth="2xl">
      <form onSubmit={handleSubmit} class="space-y-4">
        <p class="text-sm text-ink-muted">{t("director.assignments.batchHelp")}</p>
        <Show when={success()}><p role="status" class="rounded-xl bg-brand-soft p-3 text-sm text-brand-strong">{success()}</p></Show>
        <Show when={error()}><p role="alert" class="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error()}</p></Show>
        <Show when={data.error}>
          <div role="alert" class="space-y-2 text-sm text-danger">
            <p>{t("director.assignments.loadError")}</p>
            <Button variant="secondary" onClick={handleReload}>{t("director.assignments.retry")}</Button>
          </div>
        </Show>
        <Show when={data.loading}><p role="status" class="text-sm text-ink-muted">{t("common.loading")}</p></Show>
        <fieldset disabled={!ready()} class="space-y-4 disabled:opacity-60">
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="text-sm font-semibold text-ink">
              {t("director.assignments.selectClass")}
              <select required value={classId()} class={inputClass} onChange={(event) => {
                setClassId(event.currentTarget.value); setSelectedIds([]); setSuccess("");
              }}>
                <option value="" selected={!classId()}>{t("director.assignments.selectClass")}</option>
                <For each={activeClasses()}>{(item) => <option value={item.id} selected={classId() === item.id}>
                  {item.name} ({item.code}) · {formatCourseLabel(item.grade_level, locale())} · {item.academic_year}
                </option>}</For>
              </select>
            </label>
            <label class="text-sm font-semibold text-ink">
              {t("director.assignments.enrolledOn")}
              <input required type="date" value={date()} class={inputClass} onInput={(event) => setDate(event.currentTarget.value)} />
            </label>
          </div>
          <label class="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" checked={unassignedOnly()} class="mt-1" onChange={(event) => {
              setUnassignedOnly(event.currentTarget.checked); setSelectedIds([]);
            }} />
            {t("director.assignments.unassignedOnly")}
          </label>
          <Show when={!unassignedOnly()}><p class="text-sm text-ink-muted">{t("director.assignments.keepAssignments")}</p></Show>
          <label class="block text-sm font-semibold text-ink">
            {t("director.assignments.searchStudents")}
            <input type="search" value={search()} class={inputClass} onInput={(event) => {
              setSearch(event.currentTarget.value); setSelectedIds([]);
            }} />
          </label>
          <div class="flex flex-wrap items-end gap-2">
            <label class="w-28 text-sm font-semibold text-ink">
              {t("director.assignments.batchSize")}
              <input type="number" min="1" step="1" required value={batchSize()} class={inputClass}
                onInput={(event) => setBatchSize(event.currentTarget.valueAsNumber)} />
            </label>
            <Button variant="secondary" disabled={!candidates().length || !Number.isInteger(batchSize()) || batchSize() < 1}
              onClick={() => setSelectedIds(candidates().slice(0, batchSize()).map((student) => student.id))}>
              {t("director.assignments.selectBatch")}
            </Button>
            <Button variant="ghost" disabled={!candidates().length} onClick={() => setSelectedIds(candidates().map((student) => student.id))}>
              {t("director.assignments.selectAll")}
            </Button>
            <Button variant="ghost" disabled={!selection().length} onClick={() => setSelectedIds([])}>
              {t("director.assignments.clearSelection")}
            </Button>
          </div>
          <p role="status" class="text-sm font-semibold text-ink">
            {t("director.assignments.selectionCount", { selected: selection().length, total: candidates().length })}
          </p>
          <div class="max-h-64 overflow-y-auto rounded-xl border border-line">
            <Show when={candidates().length} fallback={<p class="p-4 text-sm text-ink-muted">{t("common.noResults")}</p>}>
              <For each={candidates()}>{(student) => (
                <label class="flex cursor-pointer items-center gap-3 border-b border-line/60 p-3 last:border-b-0 hover:bg-canvas-soft">
                  <input type="checkbox" checked={selectedIds().includes(student.id)} onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSelectedIds((ids) => checked ? [...ids, student.id] : ids.filter((id) => id !== student.id));
                  }} />
                  <span class="min-w-0 break-words text-sm text-ink">
                    {student.last_name}, {student.first_name}
                    <Show when={student.external_id}><span class="block text-xs text-ink-muted">{student.external_id}</span></Show>
                  </span>
                </label>
              )}</For>
            </Show>
          </div>
        </fieldset>
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="secondary" disabled={submitting()} onClick={close}>{t("common.close")}</Button>
          <Button type="submit" disabled={!ready() || !selection().length}>
            {submitting() ? t("common.saving") : t("director.assignments.assignBatch", { count: selection().length })}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
