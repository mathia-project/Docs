BEGIN;

COMMENT ON TABLE public.schools IS
    'Educational organizations and tenant boundary for application data.';
COMMENT ON TABLE public.student_profiles IS
    'School-scoped student information; authentication remains owned by Directus.';
COMMENT ON TABLE public.teacher_profiles IS
    'School-scoped teacher/director information; authorization roles remain owned by Directus.';
COMMENT ON TABLE public.classes IS
    'Teaching groups within one school and academic year.';
COMMENT ON TABLE public.class_students IS
    'Explicit enrollment relation between classes and students.';
COMMENT ON TABLE public.class_teachers IS
    'Explicit teacher assignment relation used by relational permissions.';
COMMENT ON TABLE public.resources IS
    'Pedagogical resources authored or registered by a school.';
COMMENT ON TABLE public.resource_assignments IS
    'Assignment of one resource to exactly one class or one student.';
COMMENT ON TABLE public.tests IS
    'Test metadata and versionable test definition owned by a school.';
COMMENT ON TABLE public.test_assignments IS
    'Availability of one test for exactly one class or one student.';
COMMENT ON TABLE public.test_results IS
    'One student attempt for a test assignment, including scoring and feedback.';
COMMENT ON TABLE public.pedagogical_reports IS
    'Versioned individual student report with narrative and structured output.';
COMMENT ON TABLE public.class_reports IS
    'Versioned aggregate class report with narrative and structured output.';

COMMENT ON COLUMN public.student_profiles.directus_user_id IS
    'Optional UUID of directus_users.id. No bootstrap FK because Directus creates its system tables after PostgreSQL initialization.';
COMMENT ON COLUMN public.teacher_profiles.directus_user_id IS
    'Optional UUID of directus_users.id. A director uses a Directus role plus this school-scoped profile.';
COMMENT ON COLUMN public.resources.directus_file_id IS
    'Optional UUID of directus_files.id. The Directus relation is configured after its system tables exist.';
COMMENT ON COLUMN public.tests.definition IS
    'Flexible test definition owned by PostgreSQL; keep a stable, documented JSON contract in the application layer.';
COMMENT ON COLUMN public.test_results.answers IS
    'Snapshot of submitted answers so later test-definition edits do not alter historical attempts.';
COMMENT ON COLUMN public.pedagogical_reports.generation_context IS
    'Audit metadata for report generation, not executable model data.';
COMMENT ON COLUMN public.class_reports.generation_context IS
    'Audit metadata for report generation, not executable model data.';

COMMIT;
