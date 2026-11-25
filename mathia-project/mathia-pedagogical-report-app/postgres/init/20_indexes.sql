BEGIN;

-- Business identifiers are compared case-insensitively while their original
-- spelling remains available for display.
CREATE UNIQUE INDEX IF NOT EXISTS schools_code_ci_uq
    ON public.schools (lower(code));

CREATE UNIQUE INDEX IF NOT EXISTS student_profiles_external_id_ci_uq
    ON public.student_profiles (school_id, lower(external_id))
    WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_profiles_school_active_name_idx
    ON public.student_profiles (school_id, active, last_name, first_name);

CREATE INDEX IF NOT EXISTS student_profiles_school_email_idx
    ON public.student_profiles (school_id, lower(email))
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS teacher_profiles_employee_id_ci_uq
    ON public.teacher_profiles (school_id, lower(employee_id))
    WHERE employee_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS teacher_profiles_email_ci_uq
    ON public.teacher_profiles (school_id, lower(email))
    WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS teacher_profiles_school_active_name_idx
    ON public.teacher_profiles (school_id, active, last_name, first_name);

CREATE UNIQUE INDEX IF NOT EXISTS classes_code_year_ci_uq
    ON public.classes (school_id, lower(code), academic_year);

CREATE INDEX IF NOT EXISTS classes_school_active_year_idx
    ON public.classes (school_id, active, academic_year);

CREATE INDEX IF NOT EXISTS class_students_student_active_idx
    ON public.class_students (student_id, active);

CREATE INDEX IF NOT EXISTS class_students_school_class_active_idx
    ON public.class_students (school_id, class_id, active);

CREATE INDEX IF NOT EXISTS class_teachers_teacher_active_idx
    ON public.class_teachers (teacher_id, active);

CREATE INDEX IF NOT EXISTS class_teachers_school_class_active_idx
    ON public.class_teachers (school_id, class_id, active);

CREATE INDEX IF NOT EXISTS resources_school_status_idx
    ON public.resources (school_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS resources_creator_idx
    ON public.resources (created_by_teacher_id)
    WHERE created_by_teacher_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_assignments_resource_class_uq
    ON public.resource_assignments (resource_id, class_id)
    WHERE class_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_assignments_resource_student_uq
    ON public.resource_assignments (resource_id, student_id)
    WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS resource_assignments_class_active_idx
    ON public.resource_assignments (class_id, active, available_from)
    WHERE class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS resource_assignments_student_active_idx
    ON public.resource_assignments (student_id, active, available_from)
    WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tests_school_status_idx
    ON public.tests (school_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS tests_creator_idx
    ON public.tests (created_by_teacher_id)
    WHERE created_by_teacher_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS test_assignments_test_class_uq
    ON public.test_assignments (test_id, class_id)
    WHERE class_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS test_assignments_test_student_uq
    ON public.test_assignments (test_id, student_id)
    WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS test_assignments_class_enabled_idx
    ON public.test_assignments (class_id, enabled, available_from)
    WHERE class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS test_assignments_student_enabled_idx
    ON public.test_assignments (student_id, enabled, available_from)
    WHERE student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS test_results_student_created_idx
    ON public.test_results (student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS test_results_assignment_status_idx
    ON public.test_results (test_assignment_id, status);

CREATE INDEX IF NOT EXISTS test_results_school_status_idx
    ON public.test_results (school_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS pedagogical_reports_student_period_idx
    ON public.pedagogical_reports (
        student_id,
        period_start DESC NULLS LAST,
        period_end DESC NULLS LAST
    );

CREATE INDEX IF NOT EXISTS pedagogical_reports_class_status_idx
    ON public.pedagogical_reports (class_id, status, updated_at DESC)
    WHERE class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pedagogical_reports_school_status_idx
    ON public.pedagogical_reports (school_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS class_reports_class_period_idx
    ON public.class_reports (
        class_id,
        period_start DESC NULLS LAST,
        period_end DESC NULLS LAST
    );

CREATE INDEX IF NOT EXISTS class_reports_school_status_idx
    ON public.class_reports (school_id, status, updated_at DESC);

COMMIT;
