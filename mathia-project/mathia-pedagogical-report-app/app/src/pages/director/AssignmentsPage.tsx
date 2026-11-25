import { createResource, createSignal, Show, type Component } from "solid-js";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { ActionBar } from "../../components/director/ActionBar";
import { AssignmentForm } from "../../components/director/AssignmentForm";
import { DataTable, type Column } from "../../components/director/DataTable";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";
import { formatCourseLabel } from "../../lib/curriculum";
import { directorService } from "../../services/director";
import type { ClassStudent, ClassTeacher } from "../../services/schema";

export const AssignmentsPage: Component = () => {
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = createSignal<"students" | "teachers">("students");
  const [search, setSearch] = createSignal("");
  const [isModalOpen, setIsModalOpen] = createSignal(false);

  const [classes] = createResource(() => directorService.getClasses());
  const [students] = createResource(() => directorService.getStudents());
  const [teachers] = createResource(() => directorService.getTeachers());

  const [studentAssignments, { refetch: refetchStudents }] = createResource(() =>
    directorService.getClassStudents(),
  );
  const [teacherAssignments, { refetch: refetchTeachers }] = createResource(() =>
    directorService.getClassTeachers(),
  );

  const getClassName = (classId: any) => {
    const id = typeof classId === "string" ? classId : classId?.id;
    const c = (classes() || []).find((cls) => cls.id === id);
    if (!c) return id || "-";
    const grade = c.grade_level ? ` • ${formatCourseLabel(c.grade_level, locale())}` : "";
    return `${c.name} (${c.code})${grade}`;
  };

  const getStudentName = (studentId: any) => {
    const id = typeof studentId === "string" ? studentId : studentId?.id;
    const s = (students() || []).find((stu) => stu.id === id);
    return s ? `${s.last_name}, ${s.first_name}` : id || "-";
  };

  const getTeacherName = (teacherId: any) => {
    const id = typeof teacherId === "string" ? teacherId : teacherId?.id;
    const tch = (teachers() || []).find((t) => t.id === id);
    return tch ? `${tch.last_name}, ${tch.first_name}` : id || "-";
  };

  const studentColumns: Column<ClassStudent>[] = [
    {
      key: "student_id",
      header: t("director.students.lastName"),
      sortable: true,
      render: (cs) => <span class="font-bold text-ink">{getStudentName(cs.student_id)}</span>,
    },
    {
      key: "class_id",
      header: t("director.classes.pageTitle"),
      sortable: true,
      render: (cs) => <span class="font-semibold text-ink">{getClassName(cs.class_id)}</span>,
    },
    {
      key: "enrolled_on",
      header: t("director.assignments.enrolledOn"),
      render: (cs) => <span class="text-ink-muted">{cs.enrolled_on}</span>,
    },
    {
      key: "active",
      header: t("common.status"),
      render: (cs) => (
        <span
          class={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
            cs.active !== false
              ? "bg-brand-soft text-brand-strong"
              : "bg-neutral-soft text-ink-faint"
          }`}
        >
          {cs.active !== false ? t("common.active") : t("common.inactive")}
        </span>
      ),
    },
  ];

  const teacherColumns: Column<ClassTeacher>[] = [
    {
      key: "teacher_id",
      header: t("director.teachers.lastName"),
      sortable: true,
      render: (ct) => <span class="font-bold text-ink">{getTeacherName(ct.teacher_id)}</span>,
    },
    {
      key: "class_id",
      header: t("director.classes.pageTitle"),
      sortable: true,
      render: (ct) => <span class="font-semibold text-ink">{getClassName(ct.class_id)}</span>,
    },
    {
      key: "assigned_on",
      header: t("director.assignments.assignedOn"),
      render: (ct) => <span class="text-ink-muted">{ct.assigned_on}</span>,
    },
    {
      key: "active",
      header: t("common.status"),
      render: (ct) => (
        <span
          class={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
            ct.active !== false
              ? "bg-brand-soft text-brand-strong"
              : "bg-neutral-soft text-ink-faint"
          }`}
        >
          {ct.active !== false ? t("common.active") : t("common.inactive")}
        </span>
      ),
    },
  ];

  const handleRemoveStudent = async (cs: ClassStudent) => {
    if (confirm(t("common.confirmRemove"))) {
      await directorService.removeStudentFromClass(cs.id);
      refetchStudents();
    }
  };

  const handleRemoveTeacher = async (ct: ClassTeacher) => {
    if (confirm(t("common.confirmRemove"))) {
      await directorService.removeTeacherFromClass(ct.id);
      refetchTeachers();
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={t("director.assignments.eyebrow")}
        title={t("director.assignments.pageTitle")}
        description={t("director.assignments.pageDescription")}
      />

      <div class="mt-7 space-y-4">
        <div class="flex border-b border-line">
          <button
            type="button"
            class={`pb-3 px-5 text-sm font-bold transition ${
              activeTab() === "students"
                ? "border-b-2 border-brand text-brand"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => setActiveTab("students")}
          >
            {t("director.assignments.tabStudents")}
          </button>
          <button
            type="button"
            class={`pb-3 px-5 text-sm font-bold transition ${
              activeTab() === "teachers"
                ? "border-b-2 border-brand text-brand"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => setActiveTab("teachers")}
          >
            {t("director.assignments.tabTeachers")}
          </button>
        </div>

        <ActionBar
          searchValue={search()}
          onSearchChange={setSearch}
          searchPlaceholder={t("common.search")}
        >
          <Button type="button" onClick={() => setIsModalOpen(true)}>
            <Icon name="plus" class="size-4" />
            {activeTab() === "students"
              ? t("director.assignments.batchTitle")
              : t("director.assignments.assignTeacher")}
          </Button>
        </ActionBar>

        <Show
          when={activeTab() === "students"}
          fallback={
            <DataTable
              data={teacherAssignments() || []}
              columns={teacherColumns}
              isLoading={teacherAssignments.loading}
              searchQuery={search()}
              emptyMessage={t("director.assignments.empty")}
              onDelete={handleRemoveTeacher}
            />
          }
        >
          <DataTable
            data={studentAssignments() || []}
            columns={studentColumns}
            isLoading={studentAssignments.loading}
            searchQuery={search()}
            emptyMessage={t("director.assignments.empty")}
            onDelete={handleRemoveStudent}
          />
        </Show>
      </div>

      <AssignmentForm
        isOpen={isModalOpen()}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          refetchStudents();
          refetchTeachers();
        }}
        type={activeTab() === "students" ? "student" : "teacher"}
        classes={classes() || []}
        teachers={teachers() || []}
      />
    </div>
  );
};
