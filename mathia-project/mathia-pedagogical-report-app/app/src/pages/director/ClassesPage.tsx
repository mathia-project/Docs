import { useNavigate } from "@solidjs/router";
import { createResource, createSignal, type Component } from "solid-js";
import { PageHeader } from "../../components/dashboard/PageHeader";
import { ActionBar } from "../../components/director/ActionBar";
import { ClassForm } from "../../components/director/ClassForm";
import { DataTable, type Column } from "../../components/director/DataTable";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { useI18n } from "../../lib/i18n";
import { formatCourseLabel } from "../../lib/curriculum";
import { directorService } from "../../services/director";
import type { ClassRecord } from "../../services/schema";

export const ClassesPage: Component = () => {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [classes, { refetch }] = createResource(() => directorService.getClasses());
  const [search, setSearch] = createSignal("");
  const [isModalOpen, setIsModalOpen] = createSignal(false);
  const [editingClass, setEditingClass] = createSignal<ClassRecord | null>(null);

  const columns: Column<ClassRecord>[] = [
    {
      key: "name",
      header: t("director.classes.name"),
      sortable: true,
      render: (cls) => (
        <div>
          <span class="font-bold text-ink">{cls.name}</span>
          <span class="block text-xs text-ink-muted">{cls.code}</span>
        </div>
      ),
    },
    {
      key: "academic_year",
      header: t("director.classes.academicYear"),
      sortable: true,
      render: (cls) => <span class="font-semibold text-ink">{cls.academic_year}</span>,
    },
    {
      key: "grade_level",
      header: t("director.classes.gradeLevel"),
      sortable: true,
      render: (cls) => (
        <span class="text-ink-muted">{formatCourseLabel(cls.grade_level, locale()) || "-"}</span>
      ),
    },
    {
      key: "active",
      header: t("common.status"),
      render: (cls) => (
        <span
          class={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
            cls.active !== false
              ? "bg-brand-soft text-brand-strong"
              : "bg-neutral-soft text-ink-faint"
          }`}
        >
          {cls.active !== false ? t("common.active") : t("common.inactive")}
        </span>
      ),
    },
  ];

  const handleEdit = (cls: ClassRecord) => {
    setEditingClass(cls);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingClass(null);
    setIsModalOpen(true);
  };

  const handleDelete = async (cls: ClassRecord) => {
    if (confirm(t("common.confirmDelete"))) {
      await directorService.updateClass(cls.id, { active: false });
      refetch();
    }
  };

  const handleView = (cls: ClassRecord) => {
    navigate(`/director/classes/${cls.id}`);
  };

  return (
    <div>
      <PageHeader
        eyebrow={t("director.classes.eyebrow")}
        title={t("director.classes.pageTitle")}
        description={t("director.classes.pageDescription")}
      />

      <div class="mt-7 space-y-4">
        <ActionBar
          searchValue={search()}
          onSearchChange={setSearch}
          searchPlaceholder={t("common.search")}
        >
          <Button type="button" onClick={handleCreate}>
            <Icon name="plus" class="size-4" />
            {t("director.classes.new")}
          </Button>
        </ActionBar>

        <DataTable
          data={classes() || []}
          columns={columns}
          isLoading={classes.loading}
          searchQuery={search()}
          emptyMessage={t("director.classes.empty")}
          onView={handleView}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      <ClassForm
        isOpen={isModalOpen()}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => refetch()}
        initialData={editingClass()}
      />
    </div>
  );
};
