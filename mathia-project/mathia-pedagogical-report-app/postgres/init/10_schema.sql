BEGIN;

CREATE TABLE IF NOT EXISTS public.schools (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    code text NOT NULL,
    slug text NOT NULL UNIQUE,
    default_language text NOT NULL DEFAULT 'en',
    time_zone text NOT NULL DEFAULT 'UTC',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT schools_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT schools_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT schools_slug_format CHECK (
        slug = lower(slug)
        AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
    CONSTRAINT schools_language_format CHECK (
        default_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    )
);

CREATE TABLE IF NOT EXISTS public.student_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    directus_user_id uuid UNIQUE,
    external_id text,
    first_name text NOT NULL,
    last_name text NOT NULL,
    preferred_name text,
    email text,
    date_of_birth date,
    preferred_language text NOT NULL DEFAULT 'en',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT student_profiles_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_profiles_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT student_profiles_first_name_not_blank CHECK (btrim(first_name) <> ''),
    CONSTRAINT student_profiles_last_name_not_blank CHECK (btrim(last_name) <> ''),
    CONSTRAINT student_profiles_external_id_not_blank CHECK (
        external_id IS NULL OR btrim(external_id) <> ''
    ),
    CONSTRAINT student_profiles_email_not_blank CHECK (
        email IS NULL OR btrim(email) <> ''
    ),
    CONSTRAINT student_profiles_language_format CHECK (
        preferred_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    )
);

CREATE TABLE IF NOT EXISTS public.teacher_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    directus_user_id uuid UNIQUE,
    employee_id text,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text,
    preferred_language text NOT NULL DEFAULT 'en',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT teacher_profiles_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT teacher_profiles_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT teacher_profiles_first_name_not_blank CHECK (btrim(first_name) <> ''),
    CONSTRAINT teacher_profiles_last_name_not_blank CHECK (btrim(last_name) <> ''),
    CONSTRAINT teacher_profiles_employee_id_not_blank CHECK (
        employee_id IS NULL OR btrim(employee_id) <> ''
    ),
    CONSTRAINT teacher_profiles_email_not_blank CHECK (
        email IS NULL OR btrim(email) <> ''
    ),
    CONSTRAINT teacher_profiles_language_format CHECK (
        preferred_language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    )
);

CREATE TABLE IF NOT EXISTS public.classes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    academic_year text NOT NULL,
    grade_level text,
    starts_on date,
    ends_on date,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT classes_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT classes_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT classes_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT classes_code_not_blank CHECK (btrim(code) <> ''),
    CONSTRAINT classes_academic_year_not_blank CHECK (btrim(academic_year) <> ''),
    CONSTRAINT classes_date_order CHECK (
        starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on
    )
);

CREATE TABLE IF NOT EXISTS public.class_students (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    class_id uuid NOT NULL,
    student_id uuid NOT NULL,
    enrolled_on date NOT NULL DEFAULT current_date,
    left_on date,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT class_students_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT class_students_class_school_fk
        FOREIGN KEY (class_id, school_id)
        REFERENCES public.classes (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT class_students_student_school_fk
        FOREIGN KEY (student_id, school_id)
        REFERENCES public.student_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT class_students_class_student_unique UNIQUE (class_id, student_id),
    CONSTRAINT class_students_date_order CHECK (
        left_on IS NULL OR left_on >= enrolled_on
    )
);

CREATE TABLE IF NOT EXISTS public.class_teachers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    class_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    assigned_on date NOT NULL DEFAULT current_date,
    unassigned_on date,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT class_teachers_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT class_teachers_class_school_fk
        FOREIGN KEY (class_id, school_id)
        REFERENCES public.classes (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT class_teachers_teacher_school_fk
        FOREIGN KEY (teacher_id, school_id)
        REFERENCES public.teacher_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT class_teachers_class_teacher_unique UNIQUE (class_id, teacher_id),
    CONSTRAINT class_teachers_date_order CHECK (
        unassigned_on IS NULL OR unassigned_on >= assigned_on
    )
);

CREATE TABLE IF NOT EXISTS public.resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    created_by_teacher_id uuid,
    title text NOT NULL,
    description text,
    resource_type text NOT NULL DEFAULT 'document',
    status text NOT NULL DEFAULT 'draft',
    language text NOT NULL DEFAULT 'en',
    url text,
    directus_file_id uuid,
    body text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resources_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT resources_creator_school_fk
        FOREIGN KEY (created_by_teacher_id, school_id)
        REFERENCES public.teacher_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT resources_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT resources_title_not_blank CHECK (btrim(title) <> ''),
    CONSTRAINT resources_type_allowed CHECK (
        resource_type IN ('document', 'link', 'video', 'audio', 'image', 'exercise', 'other')
    ),
    CONSTRAINT resources_status_allowed CHECK (
        status IN ('draft', 'published', 'archived')
    ),
    CONSTRAINT resources_language_format CHECK (
        language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    ),
    CONSTRAINT resources_url_not_blank CHECK (url IS NULL OR btrim(url) <> ''),
    CONSTRAINT resources_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.resource_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    class_id uuid,
    student_id uuid,
    assigned_by_teacher_id uuid,
    available_from timestamptz,
    due_at timestamptz,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resource_assignments_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT resource_assignments_resource_school_fk
        FOREIGN KEY (resource_id, school_id)
        REFERENCES public.resources (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT resource_assignments_class_school_fk
        FOREIGN KEY (class_id, school_id)
        REFERENCES public.classes (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT resource_assignments_student_school_fk
        FOREIGN KEY (student_id, school_id)
        REFERENCES public.student_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT resource_assignments_teacher_school_fk
        FOREIGN KEY (assigned_by_teacher_id, school_id)
        REFERENCES public.teacher_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT resource_assignments_one_target CHECK (
        num_nonnulls(class_id, student_id) = 1
    ),
    CONSTRAINT resource_assignments_date_order CHECK (
        available_from IS NULL OR due_at IS NULL OR due_at >= available_from
    )
);

CREATE TABLE IF NOT EXISTS public.tests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    created_by_user_id uuid,
    created_by_teacher_id uuid,
    title text NOT NULL,
    description text,
    instructions text,
    status text NOT NULL DEFAULT 'draft',
    language text NOT NULL DEFAULT 'en',
    duration_minutes integer,
    max_attempts integer NOT NULL DEFAULT 1,
    max_score numeric(10, 4),
    definition jsonb NOT NULL DEFAULT '{}'::jsonb,
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT tests_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    -- Directus creates directus_users after PostgreSQL initialization. The
    -- cross-system FK is added by a Directus migration once that table exists.
    CONSTRAINT tests_creator_school_fk
        FOREIGN KEY (created_by_teacher_id, school_id)
        REFERENCES public.teacher_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT tests_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT tests_title_not_blank CHECK (btrim(title) <> ''),
    CONSTRAINT tests_status_allowed CHECK (
        status IN ('draft', 'published', 'archived')
    ),
    CONSTRAINT tests_language_format CHECK (
        language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    ),
    CONSTRAINT tests_duration_positive CHECK (
        duration_minutes IS NULL OR duration_minutes > 0
    ),
    CONSTRAINT tests_max_attempts_positive CHECK (max_attempts > 0),
    CONSTRAINT tests_max_score_positive CHECK (max_score IS NULL OR max_score >= 0),
    CONSTRAINT tests_definition_object CHECK (jsonb_typeof(definition) = 'object')
);

CREATE TABLE IF NOT EXISTS public.test_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    test_id uuid NOT NULL,
    class_id uuid,
    student_id uuid,
    assigned_by_teacher_id uuid,
    available_from timestamptz,
    due_at timestamptz,
    max_attempts_override integer,
    enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT test_assignments_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_assignments_test_school_fk
        FOREIGN KEY (test_id, school_id)
        REFERENCES public.tests (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_assignments_class_school_fk
        FOREIGN KEY (class_id, school_id)
        REFERENCES public.classes (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_assignments_student_school_fk
        FOREIGN KEY (student_id, school_id)
        REFERENCES public.student_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_assignments_teacher_school_fk
        FOREIGN KEY (assigned_by_teacher_id, school_id)
        REFERENCES public.teacher_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_assignments_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT test_assignments_one_target CHECK (
        num_nonnulls(class_id, student_id) = 1
    ),
    CONSTRAINT test_assignments_date_order CHECK (
        available_from IS NULL OR due_at IS NULL OR due_at >= available_from
    ),
    CONSTRAINT test_assignments_attempts_positive CHECK (
        max_attempts_override IS NULL OR max_attempts_override > 0
    )
);

CREATE TABLE IF NOT EXISTS public.test_results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    test_assignment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    attempt_number integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'in_progress',
    score numeric(10, 4),
    max_score numeric(10, 4),
    answers jsonb NOT NULL DEFAULT '{}'::jsonb,
    scoring_details jsonb NOT NULL DEFAULT '{}'::jsonb,
    teacher_feedback text,
    graded_by_teacher_id uuid,
    started_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    graded_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT test_results_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_results_assignment_school_fk
        FOREIGN KEY (test_assignment_id, school_id)
        REFERENCES public.test_assignments (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_results_student_school_fk
        FOREIGN KEY (student_id, school_id)
        REFERENCES public.student_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_results_grader_school_fk
        FOREIGN KEY (graded_by_teacher_id, school_id)
        REFERENCES public.teacher_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_results_assignment_student_attempt_unique
        UNIQUE (test_assignment_id, student_id, attempt_number),
    CONSTRAINT test_results_attempt_positive CHECK (attempt_number > 0),
    CONSTRAINT test_results_status_allowed CHECK (
        status IN ('in_progress', 'submitted', 'graded', 'voided')
    ),
    CONSTRAINT test_results_score_valid CHECK (
        (score IS NULL OR score >= 0)
        AND (max_score IS NULL OR max_score > 0)
        AND (score IS NULL OR max_score IS NULL OR score <= max_score)
    ),
    CONSTRAINT test_results_answers_shape CHECK (
        jsonb_typeof(answers) IN ('object', 'array')
    ),
    CONSTRAINT test_results_scoring_details_object CHECK (
        jsonb_typeof(scoring_details) = 'object'
    ),
    CONSTRAINT test_results_submission_order CHECK (
        submitted_at IS NULL OR submitted_at >= started_at
    ),
    CONSTRAINT test_results_grading_order CHECK (
        graded_at IS NULL OR submitted_at IS NULL OR graded_at >= submitted_at
    )
);

CREATE TABLE IF NOT EXISTS public.pedagogical_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid,
    created_by_teacher_id uuid,
    title text NOT NULL,
    language text NOT NULL DEFAULT 'en',
    period_start date,
    period_end date,
    version integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'draft',
    narrative text,
    structured_content jsonb NOT NULL DEFAULT '{}'::jsonb,
    generation_context jsonb NOT NULL DEFAULT '{}'::jsonb,
    model_name text,
    model_version text,
    generated_at timestamptz,
    reviewed_at timestamptz,
    finalized_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedagogical_reports_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT pedagogical_reports_student_school_fk
        FOREIGN KEY (student_id, school_id)
        REFERENCES public.student_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT pedagogical_reports_class_school_fk
        FOREIGN KEY (class_id, school_id)
        REFERENCES public.classes (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT pedagogical_reports_teacher_school_fk
        FOREIGN KEY (created_by_teacher_id, school_id)
        REFERENCES public.teacher_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT pedagogical_reports_title_not_blank CHECK (btrim(title) <> ''),
    CONSTRAINT pedagogical_reports_language_format CHECK (
        language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    ),
    CONSTRAINT pedagogical_reports_period_order CHECK (
        period_start IS NULL OR period_end IS NULL OR period_end >= period_start
    ),
    CONSTRAINT pedagogical_reports_version_positive CHECK (version > 0),
    CONSTRAINT pedagogical_reports_status_allowed CHECK (
        status IN ('draft', 'generated', 'reviewed', 'finalized', 'archived')
    ),
    CONSTRAINT pedagogical_reports_content_object CHECK (
        jsonb_typeof(structured_content) = 'object'
    ),
    CONSTRAINT pedagogical_reports_context_object CHECK (
        jsonb_typeof(generation_context) = 'object'
    ),
    CONSTRAINT pedagogical_reports_review_order CHECK (
        reviewed_at IS NULL OR generated_at IS NULL OR reviewed_at >= generated_at
    ),
    CONSTRAINT pedagogical_reports_finalize_order CHECK (
        finalized_at IS NULL OR reviewed_at IS NULL OR finalized_at >= reviewed_at
    )
);

CREATE TABLE IF NOT EXISTS public.class_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    class_id uuid NOT NULL,
    created_by_teacher_id uuid,
    title text NOT NULL,
    language text NOT NULL DEFAULT 'en',
    period_start date,
    period_end date,
    version integer NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'draft',
    narrative text,
    structured_content jsonb NOT NULL DEFAULT '{}'::jsonb,
    generation_context jsonb NOT NULL DEFAULT '{}'::jsonb,
    model_name text,
    model_version text,
    generated_at timestamptz,
    reviewed_at timestamptz,
    finalized_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT class_reports_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT class_reports_class_school_fk
        FOREIGN KEY (class_id, school_id)
        REFERENCES public.classes (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT class_reports_teacher_school_fk
        FOREIGN KEY (created_by_teacher_id, school_id)
        REFERENCES public.teacher_profiles (id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT class_reports_title_not_blank CHECK (btrim(title) <> ''),
    CONSTRAINT class_reports_language_format CHECK (
        language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'
    ),
    CONSTRAINT class_reports_period_order CHECK (
        period_start IS NULL OR period_end IS NULL OR period_end >= period_start
    ),
    CONSTRAINT class_reports_version_positive CHECK (version > 0),
    CONSTRAINT class_reports_status_allowed CHECK (
        status IN ('draft', 'generated', 'reviewed', 'finalized', 'archived')
    ),
    CONSTRAINT class_reports_content_object CHECK (
        jsonb_typeof(structured_content) = 'object'
    ),
    CONSTRAINT class_reports_context_object CHECK (
        jsonb_typeof(generation_context) = 'object'
    ),
    CONSTRAINT class_reports_review_order CHECK (
        reviewed_at IS NULL OR generated_at IS NULL OR reviewed_at >= generated_at
    ),
    CONSTRAINT class_reports_finalize_order CHECK (
        finalized_at IS NULL OR reviewed_at IS NULL OR finalized_at >= reviewed_at
    )
);

COMMIT;
