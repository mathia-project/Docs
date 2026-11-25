BEGIN;

-- Directus currently ignores composite foreign keys during relation
-- introspection. The composite (id, school_id) keys in 10_schema.sql remain the
-- tenant-safety boundary; these redundant single-column keys expose the same
-- UUID relationships to Directus without weakening that boundary.
DO $$
DECLARE
    relation record;
BEGIN
    FOR relation IN
        SELECT *
        FROM (
            VALUES
                ('class_students_class_fk', 'class_students', 'class_id', 'classes', 'CASCADE'),
                ('class_students_student_fk', 'class_students', 'student_id', 'student_profiles', 'CASCADE'),
                ('class_teachers_class_fk', 'class_teachers', 'class_id', 'classes', 'CASCADE'),
                ('class_teachers_teacher_fk', 'class_teachers', 'teacher_id', 'teacher_profiles', 'CASCADE'),
                ('resources_creator_fk', 'resources', 'created_by_teacher_id', 'teacher_profiles', 'RESTRICT'),
                ('resource_assignments_resource_fk', 'resource_assignments', 'resource_id', 'resources', 'CASCADE'),
                ('resource_assignments_class_fk', 'resource_assignments', 'class_id', 'classes', 'CASCADE'),
                ('resource_assignments_student_fk', 'resource_assignments', 'student_id', 'student_profiles', 'CASCADE'),
                ('resource_assignments_teacher_fk', 'resource_assignments', 'assigned_by_teacher_id', 'teacher_profiles', 'RESTRICT'),
                ('tests_creator_fk', 'tests', 'created_by_teacher_id', 'teacher_profiles', 'RESTRICT'),
                ('test_assignments_test_fk', 'test_assignments', 'test_id', 'tests', 'CASCADE'),
                ('test_assignments_class_fk', 'test_assignments', 'class_id', 'classes', 'CASCADE'),
                ('test_assignments_student_fk', 'test_assignments', 'student_id', 'student_profiles', 'CASCADE'),
                ('test_assignments_teacher_fk', 'test_assignments', 'assigned_by_teacher_id', 'teacher_profiles', 'RESTRICT'),
                ('test_results_assignment_fk', 'test_results', 'test_assignment_id', 'test_assignments', 'RESTRICT'),
                ('test_results_student_fk', 'test_results', 'student_id', 'student_profiles', 'RESTRICT'),
                ('test_results_grader_fk', 'test_results', 'graded_by_teacher_id', 'teacher_profiles', 'RESTRICT'),
                ('pedagogical_reports_student_fk', 'pedagogical_reports', 'student_id', 'student_profiles', 'RESTRICT'),
                ('pedagogical_reports_class_fk', 'pedagogical_reports', 'class_id', 'classes', 'RESTRICT'),
                ('pedagogical_reports_teacher_fk', 'pedagogical_reports', 'created_by_teacher_id', 'teacher_profiles', 'RESTRICT'),
                ('class_reports_class_fk', 'class_reports', 'class_id', 'classes', 'RESTRICT'),
                ('class_reports_teacher_fk', 'class_reports', 'created_by_teacher_id', 'teacher_profiles', 'RESTRICT')
        ) AS relations(
            constraint_name,
            child_table,
            child_column,
            parent_table,
            delete_action
        )
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = relation.constraint_name
              AND conrelid = to_regclass('public.' || relation.child_table)
        ) THEN
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I '
                || 'FOREIGN KEY (%I) REFERENCES public.%I (id) '
                || 'ON UPDATE CASCADE ON DELETE %s',
                relation.child_table,
                relation.constraint_name,
                relation.child_column,
                relation.parent_table,
                relation.delete_action
            );
        END IF;
    END LOOP;
END;
$$;

COMMIT;

