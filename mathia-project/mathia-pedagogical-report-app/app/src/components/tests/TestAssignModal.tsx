import { createMemo, createResource, createSignal, For, Show, type Component } from "solid-js";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { useI18n } from "../../lib/i18n";
import { formatCourseLabel } from "../../lib/curriculum";
import { testAssignmentService } from "../../services/test-assignments";
import { testBuilderService } from "../../services/test-builder";
import { teacherService } from "../../services/teacher";
import type { TestRecord, TestVersion } from "../../services/schema";

interface Props {
  isOpen: boolean;
  test: TestRecord | null;
  onClose: () => void;
  onAssigned: () => void;
}

export const TestAssignModal: Component<Props> = (props) => {
  const { t, locale } = useI18n();

  const [versions] = createResource(
    () => props.test?.id,
    async (testId) => {
      if (!testId) return [];
      const vList = (await testBuilderService.getVersions(testId)) as TestVersion[];
      return vList.filter((v) => v.status === "published");
    },
  );

  const [classes] = createResource(async () => {
    return teacherService.getAssignedClasses();
  });

  const [assignments, { refetch: refetchAssignments }] = createResource(
    () => props.test?.id,
    async (testId) => {
      if (!testId) return [];
      return testAssignmentService.getAssignments({ test_id: testId });
    },
  );

  const [targetType, setTargetType] = createSignal<"class" | "student">("class");
  const [students] = createResource(
    () => props.isOpen && targetType() === "student",
    () => testAssignmentService.getAssignableStudents(),
  );
  const [selectedVersionId, setSelectedVersionId] = createSignal("");
  const [selectedClassId, setSelectedClassId] = createSignal("");
  const [selectedStudentId, setSelectedStudentId] = createSignal("");
  const [availableFrom, setAvailableFrom] = createSignal("");
  const [dueAt, setDueAt] = createSignal("");
  const [maxAttemptsOverride, setMaxAttemptsOverride] = createSignal<number | "">("");

  const [loading, setLoading] = createSignal(false);
  const [togglingId, setTogglingId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);

  // Auto-select latest version when loaded
  const latestVersion = createMemo(() => {
    const vList = versions();
    if (!vList || vList.length === 0) return null;
    // vList is sorted descending by version_number (-version_number)
    const sorted = [...vList].sort((a, b) => b.version_number - a.version_number);
    return sorted[0] || null;
  });

  const effectiveVersionId = createMemo(() => {
    return selectedVersionId() || latestVersion()?.id || "";
  });

  const assignedClassIds = createMemo(() => {
    const list = assignments() || [];
    const set = new Set<string>();
    for (const a of list) {
      if (a.class_id) {
        const cId = typeof a.class_id === "object" ? a.class_id.id : a.class_id;
        if (cId) set.add(cId);
      }
    }
    return set;
  });

  const allClassesAssigned = createMemo(() => {
    const cList = classes();
    if (!cList || cList.length === 0) return false;
    return cList.every((c) => assignedClassIds().has(c.id));
  });

  const handleToggleEnabled = async (assignmentId: string, currentEnabled: boolean) => {
    setTogglingId(assignmentId);
    setError(null);
    try {
      await testAssignmentService.toggleAssignmentEnabled(assignmentId, !currentEnabled);
      await refetchAssignments();
      props.onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setTogglingId(null);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    if (!effectiveVersionId()) {
      setError(t("tests.assign.selectVersion"));
      return;
    }

    if (targetType() === "class") {
      if (!selectedClassId()) {
        setError(t("tests.assign.selectClass"));
        return;
      }
      if (assignedClassIds().has(selectedClassId())) {
        setError(t("tests.assign.alreadyAssigned"));
        return;
      }
    }

    if (targetType() === "student" && !selectedStudentId()) {
      setError(t("tests.assign.selectStudent"));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await testAssignmentService.createAssignment({
        test_version_id: effectiveVersionId(),
        class_id: targetType() === "class" ? selectedClassId() : null,
        student_id: targetType() === "student" ? selectedStudentId().trim() : null,
        available_from: availableFrom() ? new Date(availableFrom()).toISOString() : null,
        due_at: dueAt() ? new Date(dueAt()).toISOString() : null,
        max_attempts_override: maxAttemptsOverride() ? Number(maxAttemptsOverride()) : null,
        enabled: true,
      });

      setSuccess(t("tests.assign.success"));
      setSelectedClassId("");
      setSelectedStudentId("");
      setAvailableFrom("");
      setDueAt("");
      setMaxAttemptsOverride("");

      await refetchAssignments();
      props.onAssigned();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common.error");
      if (msg.includes("unique") || msg.includes("already exists")) {
        setError(t("tests.assign.alreadyAssigned"));
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Show when={props.isOpen && props.test}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm">
        <div class="flex max-h-[90vh] w-full max-w-xl flex-col rounded-2xl border border-line bg-white p-6 shadow-xl">
          {/* Header */}
          <div class="flex items-center justify-between border-b border-line pb-4">
            <div>
              <h3 class="text-lg font-bold text-ink">{t("tests.assign.modalTitle")}</h3>
              <p class="text-xs text-ink-muted">{props.test?.title}</p>
            </div>
            <button
              type="button"
              onClick={() => props.onClose()}
              class="rounded-lg p-1 text-ink-muted hover:bg-canvas hover:text-ink"
            >
              <Icon name="x" class="size-5" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto space-y-6 pr-1 pt-4">
            {/* Feedback Alerts */}
            <Show when={error()}>
              <div class="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error()}
              </div>
            </Show>
            <Show when={success()}>
              <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                {success()}
              </div>
            </Show>

            {/* Existing assignments */}
            <div>
              <h4 class="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("tests.assign.existingAssignments")} ({assignments()?.length || 0})
              </h4>

              <div class="mt-2.5 overflow-hidden rounded-xl border border-line bg-canvas">
                <Show
                  when={assignments() && assignments()!.length > 0}
                  fallback={
                    <div class="p-4 text-center text-xs text-ink-muted">
                      {t("student.tests.empty")}
                    </div>
                  }
                >
                  <div class="divide-y divide-line bg-white">
                    <For each={assignments()}>
                      {(assignment) => {
                        const classObj =
                          typeof assignment.class_id === "object" ? assignment.class_id : null;
                        const versionObj =
                          typeof assignment.test_version_id === "object"
                            ? assignment.test_version_id
                            : null;

                        return (
                          <div class="flex items-center justify-between p-3.5 gap-3">
                            <div class="min-w-0 flex-1">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-sm font-semibold text-ink">
                                  {classObj
                                    ? `${classObj.name} (${classObj.code})`
                                    : assignment.student_id
                                    ? t("tests.assign.studentTarget", { id: String(assignment.student_id) })
                                    : t("nav.assignments")}
                                </span>
                                <span
                                  class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    assignment.enabled
                                      ? "bg-emerald-100 text-emerald-800"
                                      : "bg-ink-muted/15 text-ink-muted"
                                  }`}
                                >
                                  {assignment.enabled
                                    ? t("tests.assign.enabled")
                                    : t("tests.assign.disabled")}
                                </span>
                                <Show when={versionObj?.version_number}>
                                  <span class="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                                    v{versionObj!.version_number}
                                  </span>
                                </Show>
                              </div>

                              <div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-muted">
                                <Show when={assignment.available_from}>
                                  <span>
                                    {t("tests.assign.availableFrom")}:{" "}
                                    {new Date(assignment.available_from!).toLocaleDateString(locale())}
                                  </span>
                                </Show>
                                <Show when={assignment.due_at}>
                                  <span>
                                    {t("tests.assign.dueAt")}:{" "}
                                    {new Date(assignment.due_at!).toLocaleDateString(locale())}
                                  </span>
                                </Show>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={togglingId() === assignment.id}
                              onClick={() =>
                                handleToggleEnabled(assignment.id, assignment.enabled)
                              }
                              class={`shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                                assignment.enabled
                                  ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                              }`}
                            >
                              {assignment.enabled
                                ? t("tests.assign.disable")
                                : t("tests.assign.enable")}
                            </button>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              </div>
            </div>

            {/* New assignment form */}
            <form onSubmit={handleSubmit} class="space-y-4 border-t border-line pt-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-ink-muted">
                {t("tests.assign.newAssignment")}
              </h4>

              {/* Version picker */}
              <div>
                <label class="block text-xs font-bold text-ink">
                  {t("tests.assign.selectVersion")}
                </label>
                <select
                  value={effectiveVersionId()}
                  onChange={(e) => setSelectedVersionId(e.currentTarget.value)}
                  class="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                >
                  <Show when={!versions() || versions()!.length === 0}>
                    <option value="">{t("tests.assign.noVersion")}</option>
                  </Show>
                  <For each={versions()}>
                    {(v) => {
                      const isLatest = () => v.id === latestVersion()?.id;
                      return (
                        <option value={v.id}>
                          v{v.version_number}
                          {isLatest() ? ` (${t("tests.assign.latestVersion")})` : ""} ({v.max_score} pts ·{" "}
                          {v.duration_minutes ? `${v.duration_minutes}m` : t("tests.assign.noTimeLimit")})
                        </option>
                      );
                    }}
                  </For>
                </select>
              </div>

              {/* Target Type Toggle */}
              <div>
                <label class="block text-xs font-bold text-ink">{t("tests.assign.type")}</label>
                <div class="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetType("class")}
                    class={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      targetType() === "class"
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-line text-ink-muted hover:bg-canvas"
                    }`}
                  >
                    {t("tests.assign.class")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType("student")}
                    class={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      targetType() === "student"
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-line text-ink-muted hover:bg-canvas"
                    }`}
                  >
                    {t("tests.assign.student")}
                  </button>
                </div>
              </div>

              {/* Target selector */}
              <Show
                when={targetType() === "class"}
                fallback={
                  <div>
                    <label class="block text-xs font-bold text-ink">
                      {t("tests.assign.selectStudent")}
                    </label>
                    <select
                      required
                      disabled={students.loading || Boolean(students.error)}
                      value={selectedStudentId()}
                      onChange={(e) => setSelectedStudentId(e.currentTarget.value)}
                      class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                    >
                      <option value="">{t("tests.assign.selectStudent")}</option>
                      <For each={students()}>
                        {(student) => (
                          <option value={student.id}>
                            {student.first_name} {student.last_name}
                            {student.external_id ? ` (${student.external_id})` : ""}
                          </option>
                        )}
                      </For>
                    </select>
                    <Show when={students.error}>
                      <p class="mt-2 text-sm text-red-600">{t("common.error")}</p>
                    </Show>
                  </div>
                }
              >
                <div>
                  <label class="block text-xs font-bold text-ink">
                    {t("tests.assign.selectClass")}
                  </label>
                  <Show when={allClassesAssigned()}>
                    <p class="mt-1 text-xs text-brand font-medium">
                      {t("tests.assign.allClassesAssigned")}
                    </p>
                  </Show>
                  <select
                    required
                    value={selectedClassId()}
                    onChange={(e) => setSelectedClassId(e.currentTarget.value)}
                    class="mt-1.5 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                  >
                    <option value="">{t("tests.assign.selectClass")}</option>
                    <For each={classes()}>
                      {(c) => {
                        const isAssigned = assignedClassIds().has(c.id);
                        return (
                          <option value={c.id} disabled={isAssigned}>
                            {c.name} ({c.code})
                            {c.grade_level ? ` • ${formatCourseLabel(c.grade_level, locale())}` : ""}
                            {isAssigned ? ` ${t("tests.assign.alreadyAssignedTag")}` : ""}
                          </option>
                        );
                      }}
                    </For>
                  </select>
                </div>
              </Show>

              {/* Dates */}
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-ink">
                    {t("tests.assign.availableFrom")}
                  </label>
                  <input
                    type="datetime-local"
                    value={availableFrom()}
                    onInput={(e) => setAvailableFrom(e.currentTarget.value)}
                    class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                  />
                </div>

                <div>
                  <label class="block text-xs font-bold text-ink">{t("tests.assign.dueAt")}</label>
                  <input
                    type="datetime-local"
                    value={dueAt()}
                    onInput={(e) => setDueAt(e.currentTarget.value)}
                    class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-ink">
                  {t("tests.assign.maxAttempts")}
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder={t("tests.assign.defaultAttempts")}
                  value={maxAttemptsOverride()}
                  onInput={(e) =>
                    setMaxAttemptsOverride(
                      e.currentTarget.value ? Number(e.currentTarget.value) : "",
                    )
                  }
                  class="mt-1.5 w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                />
              </div>

              <div class="flex justify-end gap-3 pt-4">
                <Button variant="secondary" type="button" onClick={props.onClose}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    loading() ||
                    !effectiveVersionId() ||
                    (targetType() === "class" && (!selectedClassId() || assignedClassIds().has(selectedClassId())))
                  }
                >
                  {loading() ? t("common.saving") : t("tests.assign")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Show>
  );
};
