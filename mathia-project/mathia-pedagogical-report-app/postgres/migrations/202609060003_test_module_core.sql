BEGIN;

-- 1. Published Question Immutability Guard
CREATE OR REPLACE FUNCTION public.protect_published_question_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'published' THEN
        IF NEW.status = 'draft' THEN
            RAISE EXCEPTION 'A published question cannot be reverted to draft; create a draft copy instead'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.status = 'published' AND (
            NEW.prompt IS DISTINCT FROM OLD.prompt OR
            NEW.question_type IS DISTINCT FROM OLD.question_type OR
            NEW.difficulty IS DISTINCT FROM OLD.difficulty OR
            NEW.language IS DISTINCT FROM OLD.language OR
            NEW.domain_id IS DISTINCT FROM OLD.domain_id OR
            NEW.cluster_id IS DISTINCT FROM OLD.cluster_id OR
            NEW.standard_id IS DISTINCT FROM OLD.standard_id OR
            NEW.substandard_id IS DISTINCT FROM OLD.substandard_id OR
            NEW.answer_config IS DISTINCT FROM OLD.answer_config OR
            NEW.school_id IS DISTINCT FROM OLD.school_id
        ) THEN
            RAISE EXCEPTION 'Published questions are immutable; create a draft copy or archive the question'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF OLD.status = 'archived' AND NEW.status = 'draft' THEN
        RAISE EXCEPTION 'An archived question cannot be reverted to draft; create a draft copy instead'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
        NEW.published_at := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS question_bank_items_immutability_guard
    ON public.question_bank_items;

CREATE TRIGGER question_bank_items_immutability_guard
BEFORE UPDATE ON public.question_bank_items
FOR EACH ROW
EXECUTE FUNCTION public.protect_published_question_items();

-- 2. Question Import Batches Table (Audit & Transactions)
CREATE TABLE IF NOT EXISTS public.question_import_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    created_by_user_id uuid,
    created_by_teacher_id uuid,
    source text NOT NULL DEFAULT 'manual',
    filename text,
    schema_version text NOT NULL DEFAULT '1.0',
    status text NOT NULL DEFAULT 'pending',
    total_rows integer NOT NULL DEFAULT 0,
    valid_rows integer NOT NULL DEFAULT 0,
    invalid_rows integer NOT NULL DEFAULT 0,
    result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    CONSTRAINT question_import_batches_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_import_batches_creator_teacher_fk
        FOREIGN KEY (created_by_teacher_id, school_id) REFERENCES public.teacher_profiles(id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_import_batches_creator_teacher_single_fk
        FOREIGN KEY (created_by_teacher_id) REFERENCES public.teacher_profiles(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_import_batches_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT question_import_batches_status_allowed CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    ),
    CONSTRAINT question_import_batches_source_allowed CHECK (
        source IN ('manual', 'csv', 'ai', 'migrated')
    ),
    CONSTRAINT question_import_batches_counts_non_negative CHECK (
        total_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0
    )
);

CREATE INDEX IF NOT EXISTS question_import_batches_school_idx
    ON public.question_import_batches (school_id, status, created_at DESC);

-- Trigger to populate creator teacher and school for batches
CREATE OR REPLACE FUNCTION public.set_import_batch_creator_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_teacher_id uuid;
    resolved_school_id uuid;
BEGIN
    IF NEW.created_by_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id, school_id
      INTO resolved_teacher_id, resolved_school_id
      FROM public.teacher_profiles
     WHERE directus_user_id = NEW.created_by_user_id
       AND active = true;

    IF FOUND THEN
        IF NEW.school_id IS NULL THEN
            NEW.school_id := resolved_school_id;
        ELSIF NEW.school_id <> resolved_school_id THEN
            RAISE EXCEPTION 'Import batch school does not match creator teacher school'
                USING ERRCODE = '23514';
        END IF;
        NEW.created_by_teacher_id := resolved_teacher_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS question_import_batches_creator_scope_guard
    ON public.question_import_batches;

CREATE TRIGGER question_import_batches_creator_scope_guard
BEFORE INSERT OR UPDATE OF school_id, created_by_user_id, created_by_teacher_id
ON public.question_import_batches
FOR EACH ROW
EXECUTE FUNCTION public.set_import_batch_creator_scope();

-- 3. Test Versions Table (Immutable Snapshots)
CREATE TABLE IF NOT EXISTS public.test_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    test_id uuid NOT NULL,
    version_number integer NOT NULL,
    instructions text,
    language text NOT NULL DEFAULT 'es',
    duration_minutes integer,
    max_attempts integer NOT NULL DEFAULT 1,
    shuffle_questions boolean NOT NULL DEFAULT true,
    shuffle_options boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'published',
    max_score numeric(10, 4) NOT NULL DEFAULT 0,
    published_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid,
    created_by_teacher_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT test_versions_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_versions_test_school_fk
        FOREIGN KEY (test_id, school_id) REFERENCES public.tests(id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_versions_test_fk
        FOREIGN KEY (test_id) REFERENCES public.tests(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_versions_creator_school_fk
        FOREIGN KEY (created_by_teacher_id, school_id) REFERENCES public.teacher_profiles(id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_versions_creator_teacher_single_fk
        FOREIGN KEY (created_by_teacher_id) REFERENCES public.teacher_profiles(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_versions_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT test_versions_test_version_unique UNIQUE (test_id, version_number),
    CONSTRAINT test_versions_version_positive CHECK (version_number > 0),
    CONSTRAINT test_versions_duration_positive CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    CONSTRAINT test_versions_max_attempts_positive CHECK (max_attempts > 0),
    CONSTRAINT test_versions_max_score_non_negative CHECK (max_score >= 0),
    CONSTRAINT test_versions_status_allowed CHECK (status IN ('published', 'archived')),
    CONSTRAINT test_versions_language_format CHECK (language ~ '^[a-z]{2,3}(-[A-Z]{2})?$')
);

CREATE INDEX IF NOT EXISTS test_versions_test_idx
    ON public.test_versions (test_id, version_number DESC);

CREATE INDEX IF NOT EXISTS test_versions_school_idx
    ON public.test_versions (school_id, status, published_at DESC);

-- Trigger for test_versions updated_at
DROP TRIGGER IF EXISTS set_test_versions_updated_at ON public.test_versions;
CREATE TRIGGER set_test_versions_updated_at
BEFORE UPDATE ON public.test_versions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Test version immutability guard
CREATE OR REPLACE FUNCTION public.protect_test_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Published test versions are immutable and cannot be deleted'
            USING ERRCODE = '23514';
    END IF;

    IF OLD.status = 'published' AND NEW.status = 'published' AND (
        NEW.test_id IS DISTINCT FROM OLD.test_id OR
        NEW.version_number IS DISTINCT FROM OLD.version_number OR
        NEW.instructions IS DISTINCT FROM OLD.instructions OR
        NEW.language IS DISTINCT FROM OLD.language OR
        NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes OR
        NEW.max_attempts IS DISTINCT FROM OLD.max_attempts OR
        NEW.shuffle_questions IS DISTINCT FROM OLD.shuffle_questions OR
        NEW.shuffle_options IS DISTINCT FROM OLD.shuffle_options OR
        NEW.max_score IS DISTINCT FROM OLD.max_score OR
        NEW.school_id IS DISTINCT FROM OLD.school_id
    ) THEN
        RAISE EXCEPTION 'Published test versions are immutable; create a new version'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS test_versions_immutability_guard ON public.test_versions;
CREATE TRIGGER test_versions_immutability_guard
BEFORE UPDATE OR DELETE ON public.test_versions
FOR EACH ROW
EXECUTE FUNCTION public.protect_test_version_immutability();

-- 4. Test Sections Table
CREATE TABLE IF NOT EXISTS public.test_sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    test_version_id uuid NOT NULL,
    title text NOT NULL,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT test_sections_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_sections_version_school_fk
        FOREIGN KEY (test_version_id, school_id) REFERENCES public.test_versions(id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_sections_version_fk
        FOREIGN KEY (test_version_id) REFERENCES public.test_versions(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_sections_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT test_sections_title_not_blank CHECK (btrim(title) <> ''),
    CONSTRAINT test_sections_position_non_negative CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS test_sections_version_idx
    ON public.test_sections (test_version_id, position);

DROP TRIGGER IF EXISTS set_test_sections_updated_at ON public.test_sections;
CREATE TRIGGER set_test_sections_updated_at
BEFORE UPDATE ON public.test_sections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 5. Test Blueprint Rules Table (Rules used to generate/build versions)
CREATE TABLE IF NOT EXISTS public.test_blueprint_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    test_id uuid NOT NULL,
    section_title text NOT NULL DEFAULT 'General',
    category_id text,
    domain_id text,
    cluster_id text,
    standard_id text,
    substandard_id text,
    difficulty text,
    question_type text,
    question_count integer NOT NULL DEFAULT 1,
    manual_question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    position integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT test_blueprint_rules_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_blueprint_rules_test_school_fk
        FOREIGN KEY (test_id, school_id) REFERENCES public.tests(id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_blueprint_rules_test_fk
        FOREIGN KEY (test_id) REFERENCES public.tests(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_blueprint_rules_category_fk
        FOREIGN KEY (category_id) REFERENCES public.curriculum_categories(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_blueprint_rules_domain_fk
        FOREIGN KEY (domain_id) REFERENCES public.curriculum_domains(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_blueprint_rules_cluster_fk
        FOREIGN KEY (cluster_id) REFERENCES public.curriculum_clusters(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_blueprint_rules_standard_fk
        FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_blueprint_rules_substandard_fk
        FOREIGN KEY (substandard_id) REFERENCES public.curriculum_substandards(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_blueprint_rules_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT test_blueprint_rules_count_positive CHECK (question_count > 0),
    CONSTRAINT test_blueprint_rules_difficulty_allowed CHECK (
        difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')
    ),
    CONSTRAINT test_blueprint_rules_type_allowed CHECK (
        question_type IS NULL OR question_type IN ('single_choice', 'multiple_choice', 'true_false', 'numeric', 'short_text')
    ),
    CONSTRAINT test_blueprint_rules_manual_questions_array CHECK (
        jsonb_typeof(manual_question_ids) = 'array'
    ),
    CONSTRAINT test_blueprint_rules_position_non_negative CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS test_blueprint_rules_test_idx
    ON public.test_blueprint_rules (test_id, position);

DROP TRIGGER IF EXISTS set_test_blueprint_rules_updated_at ON public.test_blueprint_rules;
CREATE TRIGGER set_test_blueprint_rules_updated_at
BEFORE UPDATE ON public.test_blueprint_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 6. Test Version Questions Table (Materialized Snapshot of Questions)
CREATE TABLE IF NOT EXISTS public.test_version_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    test_version_id uuid NOT NULL,
    question_id uuid NOT NULL,
    section_id uuid,
    canonical_position integer NOT NULL,
    points numeric(10, 4) NOT NULL DEFAULT 1.0,
    question_snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT test_version_questions_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_version_questions_version_school_fk
        FOREIGN KEY (test_version_id, school_id) REFERENCES public.test_versions(id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_version_questions_version_fk
        FOREIGN KEY (test_version_id) REFERENCES public.test_versions(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_version_questions_question_fk
        FOREIGN KEY (question_id) REFERENCES public.question_bank_items(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_version_questions_section_fk
        FOREIGN KEY (section_id) REFERENCES public.test_sections(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT test_version_questions_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT test_version_questions_version_question_unique UNIQUE (test_version_id, question_id),
    CONSTRAINT test_version_questions_version_pos_unique UNIQUE (test_version_id, canonical_position),
    CONSTRAINT test_version_questions_points_positive CHECK (points > 0),
    CONSTRAINT test_version_questions_snapshot_object CHECK (jsonb_typeof(question_snapshot) = 'object'),
    CONSTRAINT test_version_questions_pos_non_negative CHECK (canonical_position >= 0)
);

CREATE INDEX IF NOT EXISTS test_version_questions_version_idx
    ON public.test_version_questions (test_version_id, canonical_position);

CREATE INDEX IF NOT EXISTS test_version_questions_question_idx
    ON public.test_version_questions (question_id);

-- 7. Add test_version_id to test_assignments
ALTER TABLE public.test_assignments
    ADD COLUMN IF NOT EXISTS test_version_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'test_assignments_test_version_fk'
    ) THEN
        ALTER TABLE public.test_assignments
            ADD CONSTRAINT test_assignments_test_version_fk
            FOREIGN KEY (test_version_id) REFERENCES public.test_versions(id)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS test_assignments_version_idx
    ON public.test_assignments (test_version_id);

-- 8. Test Attempts Table (Student Attempt Execution)
CREATE TABLE IF NOT EXISTS public.test_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    test_assignment_id uuid NOT NULL,
    test_version_id uuid NOT NULL,
    student_id uuid NOT NULL,
    attempt_number integer NOT NULL DEFAULT 1,
    random_seed text NOT NULL,
    status text NOT NULL DEFAULT 'in_progress',
    started_at timestamptz NOT NULL DEFAULT now(),
    submitted_at timestamptz,
    expires_at timestamptz,
    score numeric(10, 4),
    max_score numeric(10, 4) NOT NULL DEFAULT 0,
    graded_at timestamptz,
    graded_by_teacher_id uuid,
    teacher_feedback text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT test_attempts_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempts_assignment_school_fk
        FOREIGN KEY (test_assignment_id, school_id) REFERENCES public.test_assignments(id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempts_assignment_fk
        FOREIGN KEY (test_assignment_id) REFERENCES public.test_assignments(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempts_version_fk
        FOREIGN KEY (test_version_id) REFERENCES public.test_versions(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempts_student_school_fk
        FOREIGN KEY (student_id, school_id) REFERENCES public.student_profiles(id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempts_student_fk
        FOREIGN KEY (student_id) REFERENCES public.student_profiles(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempts_grader_school_fk
        FOREIGN KEY (graded_by_teacher_id, school_id) REFERENCES public.teacher_profiles(id, school_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempts_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT test_attempts_assignment_student_attempt_unique UNIQUE (test_assignment_id, student_id, attempt_number),
    CONSTRAINT test_attempts_attempt_positive CHECK (attempt_number > 0),
    CONSTRAINT test_attempts_status_allowed CHECK (
        status IN ('in_progress', 'submitted', 'graded', 'expired', 'voided')
    ),
    CONSTRAINT test_attempts_score_range CHECK (
        score IS NULL OR score >= 0
    ),
    CONSTRAINT test_attempts_max_score_non_negative CHECK (max_score >= 0),
    CONSTRAINT test_attempts_dates_order CHECK (
        submitted_at IS NULL OR submitted_at >= started_at
    )
);

CREATE INDEX IF NOT EXISTS test_attempts_assignment_idx
    ON public.test_attempts (test_assignment_id, student_id, attempt_number);

CREATE INDEX IF NOT EXISTS test_attempts_student_idx
    ON public.test_attempts (student_id, status);

DROP TRIGGER IF EXISTS set_test_attempts_updated_at ON public.test_attempts;
CREATE TRIGGER set_test_attempts_updated_at
BEFORE UPDATE ON public.test_attempts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 9. Test Attempt Questions Table (Materialized Student Question Order & Time)
CREATE TABLE IF NOT EXISTS public.test_attempt_questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    attempt_id uuid NOT NULL,
    test_version_question_id uuid NOT NULL,
    display_position integer NOT NULL,
    option_order jsonb,
    first_presented_at timestamptz,
    last_presented_at timestamptz,
    answered_at timestamptz,
    active_duration_ms bigint NOT NULL DEFAULT 0,
    visit_count integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT test_attempt_questions_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempt_questions_attempt_school_fk
        FOREIGN KEY (attempt_id, school_id) REFERENCES public.test_attempts(id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_attempt_questions_attempt_fk
        FOREIGN KEY (attempt_id) REFERENCES public.test_attempts(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_attempt_questions_version_q_fk
        FOREIGN KEY (test_version_question_id) REFERENCES public.test_version_questions(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempt_questions_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT test_attempt_questions_attempt_vq_unique UNIQUE (attempt_id, test_version_question_id),
    CONSTRAINT test_attempt_questions_attempt_pos_unique UNIQUE (attempt_id, display_position),
    CONSTRAINT test_attempt_questions_pos_non_negative CHECK (display_position >= 0),
    CONSTRAINT test_attempt_questions_active_duration_non_negative CHECK (active_duration_ms >= 0),
    CONSTRAINT test_attempt_questions_visit_count_non_negative CHECK (visit_count >= 0),
    CONSTRAINT test_attempt_questions_option_order_array CHECK (
        option_order IS NULL OR jsonb_typeof(option_order) = 'array'
    )
);

CREATE INDEX IF NOT EXISTS test_attempt_questions_attempt_idx
    ON public.test_attempt_questions (attempt_id, display_position);

DROP TRIGGER IF EXISTS set_test_attempt_questions_updated_at ON public.test_attempt_questions;
CREATE TRIGGER set_test_attempt_questions_updated_at
BEFORE UPDATE ON public.test_attempt_questions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 10. Test Attempt Answers Table
CREATE TABLE IF NOT EXISTS public.test_attempt_answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    attempt_question_id uuid NOT NULL,
    answer_payload jsonb NOT NULL,
    is_correct boolean,
    score_awarded numeric(10, 4),
    answered_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT test_attempt_answers_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT test_attempt_answers_attempt_q_school_fk
        FOREIGN KEY (attempt_question_id, school_id) REFERENCES public.test_attempt_questions(id, school_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_attempt_answers_attempt_q_fk
        FOREIGN KEY (attempt_question_id) REFERENCES public.test_attempt_questions(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT test_attempt_answers_id_school_unique UNIQUE (id, school_id),
    CONSTRAINT test_attempt_answers_attempt_q_unique UNIQUE (attempt_question_id),
    CONSTRAINT test_attempt_answers_payload_object CHECK (jsonb_typeof(answer_payload) = 'object'),
    CONSTRAINT test_attempt_answers_score_non_negative CHECK (
        score_awarded IS NULL OR score_awarded >= 0
    )
);

CREATE INDEX IF NOT EXISTS test_attempt_answers_q_idx
    ON public.test_attempt_answers (attempt_question_id);

DROP TRIGGER IF EXISTS set_test_attempt_answers_updated_at ON public.test_attempt_answers;
CREATE TRIGGER set_test_attempt_answers_updated_at
BEFORE UPDATE ON public.test_attempt_answers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 11. Stored Function for Atomic Question Batch Import
CREATE OR REPLACE FUNCTION public.import_question_batch(
    p_school_id uuid,
    p_user_id uuid,
    p_source text,
    p_filename text,
    p_schema_version text,
    p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    v_batch_id uuid := gen_random_uuid();
    v_teacher_id uuid;
    v_total_rows integer;
    v_item jsonb;
    v_idx integer := 0;
    v_question_id uuid;
    v_opt jsonb;
    v_opt_key text;
    v_opt_content text;
    v_opt_correct boolean;
    v_opt_idx integer;
    v_imported_count integer := 0;
BEGIN
    -- Verify teacher profile
    SELECT id INTO v_teacher_id
      FROM public.teacher_profiles
     WHERE directus_user_id = p_user_id
       AND school_id = p_school_id
       AND active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active teacher profile not found for user % in school %', p_user_id, p_school_id
            USING ERRCODE = '23514';
    END IF;

    v_total_rows := jsonb_array_length(p_items);
    IF v_total_rows IS NULL OR v_total_rows = 0 THEN
        RAISE EXCEPTION 'Empty questions array provided for import'
            USING ERRCODE = '23514';
    END IF;

    -- Insert batch record
    INSERT INTO public.question_import_batches (
        id, school_id, created_by_user_id, created_by_teacher_id,
        source, filename, schema_version, status,
        total_rows, valid_rows, invalid_rows, result_summary
    ) VALUES (
        v_batch_id, p_school_id, p_user_id, v_teacher_id,
        p_source, p_filename, p_schema_version, 'processing',
        v_total_rows, 0, 0, jsonb_build_object('started_at', now())
    );

    -- Loop through items and insert atomically
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_idx := v_idx + 1;
        v_question_id := gen_random_uuid();

        -- Validate minimum required fields
        IF v_item->>'prompt' IS NULL OR btrim(v_item->>'prompt') = '' THEN
            RAISE EXCEPTION 'Row %: prompt is required', v_idx USING ERRCODE = '23514';
        END IF;

        IF v_item->>'domain_id' IS NULL OR btrim(v_item->>'domain_id') = '' THEN
            RAISE EXCEPTION 'Row %: domain_id is required', v_idx USING ERRCODE = '23514';
        END IF;

        -- Insert question item as draft
        INSERT INTO public.question_bank_items (
            id, school_id, created_by_user_id, created_by_teacher_id,
            external_id, question_type, prompt, explanation,
            difficulty, language, domain_id, cluster_id,
            standard_id, substandard_id, visibility, status,
            source, source_reference, answer_config, metadata
        ) VALUES (
            v_question_id,
            p_school_id,
            p_user_id,
            v_teacher_id,
            NULLIF(btrim(v_item->>'external_id'), ''),
            COALESCE(v_item->>'question_type', 'single_choice'),
            btrim(v_item->>'prompt'),
            NULLIF(btrim(v_item->>'explanation'), ''),
            COALESCE(v_item->>'difficulty', 'medium'),
            COALESCE(v_item->>'language', 'es'),
            btrim(v_item->>'domain_id'),
            NULLIF(btrim(v_item->>'cluster_id'), ''),
            NULLIF(btrim(v_item->>'standard_id'), ''),
            NULLIF(btrim(v_item->>'substandard_id'), ''),
            COALESCE(v_item->>'visibility', 'private'),
            'draft',
            p_source,
            p_filename,
            COALESCE(v_item->'answer_config', '{}'::jsonb),
            jsonb_build_object('batch_id', v_batch_id, 'batch_row', v_idx)
        );

        -- Insert options if provided
        IF v_item->'options' IS NOT NULL AND jsonb_typeof(v_item->'options') = 'array' THEN
            v_opt_idx := 0;
            FOR v_opt IN SELECT * FROM jsonb_array_elements(v_item->'options')
            LOOP
                v_opt_key := COALESCE(v_opt->>'option_key', chr(65 + v_opt_idx));
                v_opt_content := btrim(COALESCE(v_opt->>'content', ''));
                v_opt_correct := COALESCE((v_opt->>'is_correct')::boolean, false);

                IF v_opt_content <> '' THEN
                    INSERT INTO public.question_options (
                        id, school_id, created_by_user_id, question_id,
                        option_key, content, is_correct, position, feedback
                    ) VALUES (
                        gen_random_uuid(),
                        p_school_id,
                        p_user_id,
                        v_question_id,
                        v_opt_key,
                        v_opt_content,
                        v_opt_correct,
                        v_opt_idx,
                        NULLIF(btrim(v_opt->>'feedback'), '')
                    );
                    v_opt_idx := v_opt_idx + 1;
                END IF;
            END LOOP;
        END IF;

        v_imported_count := v_imported_count + 1;
    END LOOP;

    -- Update batch record
    UPDATE public.question_import_batches
       SET status = 'completed',
           valid_rows = v_imported_count,
           invalid_rows = 0,
           completed_at = now(),
           result_summary = jsonb_build_object(
               'imported_count', v_imported_count,
               'completed_at', now()
           )
     WHERE id = v_batch_id;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'imported_count', v_imported_count
    );
END;
$$;

-- 8. Tests Creator User and Scope Guard
ALTER TABLE public.tests
    ADD COLUMN IF NOT EXISTS created_by_user_id uuid;

CREATE OR REPLACE FUNCTION public.set_test_creator_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_teacher_id uuid;
    resolved_school_id uuid;
BEGIN
    IF NEW.created_by_user_id IS NOT NULL THEN
        SELECT id, school_id
          INTO resolved_teacher_id, resolved_school_id
          FROM public.teacher_profiles
         WHERE directus_user_id = NEW.created_by_user_id
           AND active = true;

        IF FOUND THEN
            IF NEW.school_id IS NULL THEN
                NEW.school_id := resolved_school_id;
            ELSIF NEW.school_id <> resolved_school_id THEN
                RAISE EXCEPTION 'Test creator school does not match teacher school'
                    USING ERRCODE = '23514';
            END IF;
            NEW.created_by_teacher_id := resolved_teacher_id;
        END IF;
    END IF;

    IF NEW.created_by_teacher_id IS NOT NULL AND NEW.school_id IS NULL THEN
        SELECT school_id INTO NEW.school_id
        FROM public.teacher_profiles
        WHERE id = NEW.created_by_teacher_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tests_creator_scope_guard ON public.tests;

CREATE TRIGGER tests_creator_scope_guard
BEFORE INSERT OR UPDATE OF school_id, created_by_user_id, created_by_teacher_id
ON public.tests
FOR EACH ROW
EXECUTE FUNCTION public.set_test_creator_scope();

COMMIT;

