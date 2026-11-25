import { createResource, createSignal, type Component } from "solid-js";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { ActionBar } from "../../components/director/ActionBar";
import { DataTable, type Column } from "../../components/director/DataTable";
import { TeacherForm } from "../../components/director/TeacherForm";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";
import { directorService } from "../../services/director";
import type { TeacherProfile } from "../../services/schema";

export const TeachersPage: Component = () => {
  const { t } = useI18n();
  const [teachers, { refetch }] = createResource(() => directorService.getTeachers());
  const [search, setSearch] = createSignal("");
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [editingTeacher, setEditingTeacher] = createSignal<TeacherProfile | null>(null);

  const columns: Column<TeacherProfile>[] = [
    {
      key: "last_name",
      header: t("director.teachers.lastName"),
      sortable: true,
      render: (tch) => (
        <span class="font-bold text-ink">
          {tch.last_name}, {tch.first_name}
        </span>
      ),
    },
    {
      key: "employee_id",
      header: t("director.teachers.employeeId"),
      sortable: true,
      render: (tch) => <span class="font-mono text-xs font-semibold text-ink">{tch.employee_id || "-"}</span>,
    },
    {
      key: "email",
      header: t("director.teachers.email"),
      sortable: true,
      render: (tch) => <span class="text-ink-muted">{tch.email || "-"}</span>,
    },
    {
      key: "preferred_language",
      header: t("director.teachers.language"),
      render: (tch) => (
        <span class="rounded bg-canvas px-2 py-0.5 text-xs font-bold uppercase text-ink-muted">
          {tch.preferred_language}
        </span>
      ),
    },
    {
      key: "active",
      header: t("common.status"),
      render: (tch) => (
        <span
          class={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
            tch.active !== false
              ? "bg-brand-soft text-brand-strong"
              : "bg-neutral-soft text-ink-faint"
          }`}
        >
          {tch.active !== false ? t("common.active") : t("common.inactive")}
        </span>
      ),
    },
  ];

  const handleCreate = () => {
    setEditingTeacher(null);
    setIsModalOpen(true);
  };

  const handleEdit = (tch: TeacherProfile) => {
    setEditingTeacher(tch);
    setIsModalOpen(true);
  };

  const handleDelete = async (tch: TeacherProfile) => {
    if (confirm(t("common.confirmDelete"))) {
      await directorService.updateTeacher(tch.id, { active: false });
      refetch();
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow={t("director.teachers.eyebrow")}
        title={t("director.teachers.pageTitle")}
        description={t("director.teachers.pageDescription")}
      />

      <div class="mt-7 space-y-4">
        <ActionBar
          searchValue={search()}
          onSearchChange={setSearch}
          searchPlaceholder={t("common.search")}
        >
          <Button type="button" onClick={handleCreate}>
            <Icon name="plus" class="size-4" />
            {t("director.teachers.new")}
          </Button>
        </ActionBar>

        <DataTable
          data={teachers() || []}
          columns={columns}
          isLoading={teachers.loading}
          searchQuery={search()}
          emptyMessage={t("director.teachers.empty")}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      <TeacherForm
        isOpen={isModalOpen()}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => refetch()}
        initialData={editingTeacher()}
      />
    </div>
  );
};
