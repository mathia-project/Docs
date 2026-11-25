import { A, useParams } from "@solidjs/router";
import { createResource, createSignal, For, Show, type Component } from "solid-js";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { AssignmentForm } from "../../components/director/AssignmentForm";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";
import { formatCourseLabel } from "../../lib/curriculum";
import { directorService } from "../../services/director";

export const ClassDetailPage: Component = () => {
  const { t, locale } = useI18n();
  const params = useParams();
  const classId = () => params.id || "";

  const [classRecord] = createResource(classId, (id) =>
    directorService.getClass(id),
  );
  const [classStudents, { refetch: refetchStudents }] = createResource(classId, (id) =>
    directorService.getClassStudents(id),
  );
  const [classTeachers, { refetch: refetchTeachers }] = createResource(classId, (id) =>
    directorService.getClassTeachers(id),
  );
  const [allStudents] = createResource(() => directorService.getStudents());
  const [allTeachers] = createResource(() => directorService.getTeachers());

  const [assignmentModal, setAssignmentModal] = createSignal<{
    isOpen: boolean;
    type: "student" | "teacher";
  }>({ isOpen: false, type: "student" });

  const activeStudents = () => (classStudents() || []).filter((cs) => cs.active !== false);
  const activeTeachers = () => (classTeachers() || []).filter((ct) => ct.active !== false);

  const getStudentName = (studentId: string | any) => {
    const id = typeof studentId === "string" ? studentId : studentId?.id;
    const s = (allStudents() || []).find((st) => st.id === id);
    return s ? `${s.last_name}, ${s.first_name}` : id || "-";
  };

  const getStudentCode = (studentId: string | any) => {
    const id = typeof studentId === "string" ? studentId : studentId?.id;
    const s = (allStudents() || []).find((st) => st.id === id);
    return s?.external_id || "-";
  };

  const getTeacherName = (teacherId: string | any) => {
    const id = typeof teacherId === "string" ? teacherId : teacherId?.id;
    const tch = (allTeachers() || []).find((t) => t.id === id);
    return tch ? `${tch.last_name}, ${tch.first_name}` : id || "-";
  };

  const getTeacherEmail = (teacherId: string | any) => {
    const id = typeof teacherId === "string" ? teacherId : teacherId?.id;
    const tch = (allTeachers() || []).find((t) => t.id === id);
    return tch?.email || "-";
  };

  const handleRemoveStudent = async (classStudentId: string) => {
    if (confirm(t("common.confirmRemove"))) {
      await directorService.removeStudentFromClass(classStudentId);
      refetchStudents();
    }
  };

  const handleRemoveTeacher = async (classTeacherId: string) => {
    if (confirm(t("common.confirmRemove"))) {
      await directorService.removeTeacherFromClass(classTeacherId);
      refetchTeachers();
    }
  };

  return (
    <div>
      <div class="mb-4">
        <A
          href="/director/classes"
          class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-muted hover:text-brand"
        >
          ← {t("common.back")}
        </A>
      </div>

      <Show
        when={!classRecord.loading && classRecord()}
        fallback={
          <div class="flex items-center justify-center p-12 text-ink-muted">
            <span class="grid size-10 animate-spin place-items-center rounded-full border-2 border-brand border-t-transparent text-brand" />
          </div>
        }
      >
        <PageHeader
          eyebrow={t("director.classDetail.eyebrow")}
          title={classRecord()!.name}
          description={`${classRecord()!.code} • ${classRecord()!.academic_year} • ${formatCourseLabel(classRecord()!.grade_level, locale()) || "General"}`}
        />

        <div class="mt-7 grid gap-6 lg:grid-cols-2">
          {/* Teachers Section */}
          <div class="rounded-3xl border border-line bg-white p-6 shadow-card">
            <div class="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 class="font-bold text-ink">{t("director.classDetail.teachersSection")}</h3>
                <p class="text-xs text-ink-muted">{t("director.classDetail.assignedCount", { count: activeTeachers().length })}</p>
              </div>
              <Button
                variant="secondary"
                class="!min-h-9 !py-1.5 !text-xs"
                onClick={() => setAssignmentModal({ isOpen: true, type: "teacher" })}
              >
                <Icon name="plus" class="size-3.5" />
                {t("director.classDetail.assignTeacher")}
              </Button>
            </div>

            <div class="mt-4">
              <Show
                when={activeTeachers().length > 0}
                fallback={
                  <p class="py-8 text-center text-sm text-ink-muted">
                    {t("director.classDetail.teachersEmpty")}
                  </p>
                }
              >
                <ul class="divide-y divide-line/60">
                  <For each={activeTeachers()}>
                    {(ct) => (
                      <li class="flex items-center justify-between py-3">
                        <div>
                          <p class="text-sm font-bold text-ink">
                            {getTeacherName(ct.teacher_id)}
                          </p>
                          <p class="text-xs text-ink-muted">
                            {getTeacherEmail(ct.teacher_id)} • {t("director.classDetail.assignedOn")}: {ct.assigned_on}
                          </p>
                        </div>
                        <button
                          type="button"
                          class="grid size-8 place-items-center rounded-lg text-ink-muted transition hover:bg-danger-soft hover:text-danger"
                          onClick={() => handleRemoveTeacher(ct.id)}
                          title={t("common.remove")}
                        >
                          <Icon name="trash" class="size-4" />
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </div>

          {/* Students Section */}
          <div class="rounded-3xl border border-line bg-white p-6 shadow-card">
            <div class="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 class="font-bold text-ink">{t("director.classDetail.studentsSection")}</h3>
                <p class="text-xs text-ink-muted">{t("director.classDetail.enrolledCount", { count: activeStudents().length })}</p>
              </div>
              <Button
                variant="secondary"
                class="!min-h-9 !py-1.5 !text-xs"
                onClick={() => setAssignmentModal({ isOpen: true, type: "student" })}
              >
                <Icon name="plus" class="size-3.5" />
                {t("director.assignments.batchTitle")}
              </Button>
            </div>

            <div class="mt-4">
              <Show
                when={activeStudents().length > 0}
                fallback={
                  <p class="py-8 text-center text-sm text-ink-muted">
                    {t("director.classDetail.studentsEmpty")}
                  </p>
                }
              >
                <ul class="divide-y divide-line/60">
                  <For each={activeStudents()}>
                    {(cs) => (
                      <li class="flex items-center justify-between py-3">
                        <div>
                          <p class="text-sm font-bold text-ink">
                            {getStudentName(cs.student_id)}
                          </p>
                          <p class="text-xs text-ink-muted">
                            ID: {getStudentCode(cs.student_id)} • {t("director.classDetail.enrolledOn")}: {cs.enrolled_on}
                          </p>
                        </div>
                        <button
                          type="button"
                          class="grid size-8 place-items-center rounded-lg text-ink-muted transition hover:bg-danger-soft hover:text-danger"
                          onClick={() => handleRemoveStudent(cs.id)}
                          title={t("common.remove")}
                        >
                          <Icon name="trash" class="size-4" />
                        </button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          </div>
        </div>

        <Show when={classRecord()}>
          <AssignmentForm
            isOpen={assignmentModal().isOpen}
            onClose={() => setAssignmentModal({ isOpen: false, type: "student" })}
            onSuccess={() => {
              refetchStudents();
              refetchTeachers();
            }}
            type={assignmentModal().type}
            classes={[classRecord()!]}
            teachers={allTeachers() || []}
            preselectedClassId={classRecord()!.id}
          />
        </Show>
      </Show>
    </div>
  );
};
