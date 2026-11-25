import { useNavigate } from "@solidjs/router";
import { createResource, createSignal, Show, type Component } from "solid-js";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { ActionBar } from "../../components/director/ActionBar";
import { DataTable, type Column } from "../../components/director/DataTable";
import { StudentForm } from "../../components/director/StudentForm";
import { StudentBatchAssignmentForm } from "../../components/director/StudentBatchAssignmentForm";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";
import { directorService } from "../../services/director";
import type { StudentProfile } from "../../services/schema";

export const StudentsPage: Component = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [students, { refetch }] = createResource(() => directorService.getStudents());
  const [search, setSearch] = createSignal("");
  const [isAssignmentOpen, setIsAssignmentOpen] = createSignal(false);
  const [modalState, setModalState] = createSignal<{
    isOpen: boolean;
    mode: "form" | "import";
    editingStudent: StudentProfile | null;
  }>({ isOpen: false, mode: "form", editingStudent: null });

  const columns: Column<StudentProfile>[] = [
    {
      key: "last_name",
      header: t("director.students.lastName"),
      sortable: true,
      render: (stu) => (
        <div>
          <span class="font-bold text-ink">
            {stu.last_name}, {stu.first_name}
          </span>
          <Show when={stu.preferred_name}>
            <span class="block text-xs text-ink-muted">({stu.preferred_name})</span>
          </Show>
        </div>
      ),
    },
    {
      key: "external_id",
      header: t("director.students.externalId"),
      sortable: true,
      render: (stu) => <span class="font-mono text-xs font-semibold text-ink">{stu.external_id || "-"}</span>,
    },
    {
      key: "email",
      header: t("director.students.email"),
      sortable: true,
      render: (stu) => <span class="text-ink-muted">{stu.email || "-"}</span>,
    },
    {
      key: "preferred_language",
      header: t("director.students.language"),
      render: (stu) => (
        <span class="rounded bg-canvas px-2 py-0.5 text-xs font-bold uppercase text-ink-muted">
          {stu.preferred_language}
        </span>
      ),
    },
    {
      key: "sex",
      header: t("director.students.sex"),
      render: (stu) => (
        <span class="text-xs text-ink-muted">
          {stu.sex
            ? stu.sex === "male"
              ? t("director.students.sexMale")
              : stu.sex === "female"
                ? t("director.students.sexFemale")
                : t("director.students.sexOther")
            : "-"}
        </span>
      ),
    },
    {
      key: "has_diagnosis",
      header: t("director.students.diagnosisSection"),
      render: (stu) => (
        <div class="flex items-center gap-1.5">
          <Show
            when={stu.has_diagnosis}
            fallback={
              <Show
                when={stu.needs_evaluation}
                fallback={<span class="text-xs text-ink-muted">-</span>}
              >
                <span class="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {t("director.students.evaluationAlert")}
                </span>
              </Show>
            }
          >
            <span
              class="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700"
              title={stu.diagnosis_notes || undefined}
            >
              {t("director.students.diagnosisActive")}
            </span>
          </Show>
        </div>
      ),
    },
    {
      key: "active",
      header: t("common.status"),
      render: (stu) => (
        <span
          class={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
            stu.active !== false
              ? "bg-brand-soft text-brand-strong"
              : "bg-neutral-soft text-ink-faint"
          }`}
        >
          {stu.active !== false ? t("common.active") : t("common.inactive")}
        </span>
      ),
    },
  ];

  const handleCreate = () => {
    setModalState({ isOpen: true, mode: "form", editingStudent: null });
  };

  const handleImport = () => {
    setModalState({ isOpen: true, mode: "import", editingStudent: null });
  };

  const handleEdit = (stu: StudentProfile) => {
    setModalState({ isOpen: true, mode: "form", editingStudent: stu });
  };

  const handleViewReport = (stu: StudentProfile) => {
    navigate(`/director/students/${stu.id}/report`);
  };

  const handleDelete = async (stu: StudentProfile) => {
    if (confirm(t("common.confirmDelete"))) {
      await directorService.updateStudent(stu.id, { active: false });
      refetch();
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={t("director.students.eyebrow")}
        title={t("director.students.pageTitle")}
        description={t("director.students.pageDescription")}
      />

      <div class="mt-7 space-y-4">
        <ActionBar
          searchValue={search()}
          onSearchChange={setSearch}
          searchPlaceholder={t("common.search")}
        >
          <Button variant="secondary" type="button" onClick={() => setIsAssignmentOpen(true)}>
            {t("director.assignments.batchTitle")}
          </Button>
          <Button variant="secondary" type="button" onClick={handleImport}>
            <Icon name="upload" class="size-4" />
            {t("director.students.import")}
          </Button>
          <Button type="button" onClick={handleCreate}>
            <Icon name="plus" class="size-4" />
            {t("director.students.new")}
          </Button>
        </ActionBar>

        <DataTable
          data={students() || []}
          columns={columns}
          isLoading={students.loading}
          searchQuery={search()}
          emptyMessage={t("director.students.empty")}
          onView={handleViewReport}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      <StudentForm
        isOpen={modalState().isOpen}
        mode={modalState().mode}
        initialData={modalState().editingStudent}
        onClose={() => setModalState({ isOpen: false, mode: "form", editingStudent: null })}
        onSuccess={() => refetch()}
      />
      <StudentBatchAssignmentForm
        isOpen={isAssignmentOpen()}
        onClose={() => setIsAssignmentOpen(false)}
        onSuccess={() => {}}
      />
    </div>
  );
};
