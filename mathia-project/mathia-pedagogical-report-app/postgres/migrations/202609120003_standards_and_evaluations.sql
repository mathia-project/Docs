-- 202609120001_standards_and_evaluations.sql
-- Migration: Curricular classification & evaluation to Standard & Substandard
-- Enforces Course + Standard context, multi-target resources, and authoritative 0-15 scoring without baselines.

BEGIN;

-- 1. Question Course Alignments Table
CREATE TABLE IF NOT EXISTS public.question_course_alignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    question_id uuid NOT NULL,
    course_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT question_course_alignments_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_course_alignments_question_fk
        FOREIGN KEY (question_id) REFERENCES public.question_bank_items(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT question_course_alignments_course_fk
        FOREIGN KEY (course_id) REFERENCES public.curriculum_courses(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT question_course_alignments_unique
        UNIQUE (question_id, course_id)
);

CREATE INDEX IF NOT EXISTS question_course_alignments_question_idx
    ON public.question_course_alignments (question_id);

CREATE INDEX IF NOT EXISTS question_course_alignments_course_idx
    ON public.question_course_alignments (course_id);

CREATE INDEX IF NOT EXISTS question_course_alignments_school_idx
    ON public.question_course_alignments (school_id);

DROP TRIGGER IF EXISTS set_question_course_alignments_updated_at ON public.question_course_alignments;
CREATE TRIGGER set_question_course_alignments_updated_at
BEFORE UPDATE ON public.question_course_alignments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Backfill initial question course alignments for existing question bank items
INSERT INTO public.question_course_alignments (school_id, question_id, course_id)
SELECT DISTINCT
    q.school_id,
    q.id AS question_id,
    COALESCE(
        (SELECT ccs.course_id FROM public.curriculum_course_standards ccs WHERE ccs.standard_id = q.standard_id LIMIT 1),
        CASE
            WHEN q.domain_id LIKE '6.%' THEN 'grade-6'
            WHEN q.domain_id LIKE '7.%' THEN 'grade-7'
            WHEN q.domain_id LIKE '8.%' THEN 'grade-8'
            WHEN q.domain_id LIKE 'HS%' THEN 'grade-9'
            ELSE 'grade-6'
        END
    ) AS course_id
FROM public.question_bank_items q
ON CONFLICT (question_id, course_id) DO NOTHING;

-- 2. Resource Curriculum Alignments Table (Multi-target alignment)
CREATE TABLE IF NOT EXISTS public.resource_curriculum_alignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    resource_id uuid NOT NULL,
    course_id text NOT NULL,
    domain_id text,
    standard_id text,
    substandard_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT resource_curriculum_alignments_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT resource_curriculum_alignments_resource_fk
        FOREIGN KEY (resource_id) REFERENCES public.resources(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT resource_curriculum_alignments_course_fk
        FOREIGN KEY (course_id) REFERENCES public.curriculum_courses(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT resource_curriculum_alignments_domain_fk
        FOREIGN KEY (domain_id) REFERENCES public.curriculum_domains(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT resource_curriculum_alignments_standard_fk
        FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT resource_curriculum_alignments_substandard_fk
        FOREIGN KEY (substandard_id) REFERENCES public.curriculum_substandards(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT resource_curriculum_alignments_substandard_requires_standard
        CHECK (substandard_id IS NULL OR standard_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS resource_curriculum_alignments_unique_idx
    ON public.resource_curriculum_alignments (
        resource_id,
        course_id,
        COALESCE(domain_id, ''),
        COALESCE(standard_id, ''),
        COALESCE(substandard_id, '')
    );

CREATE INDEX IF NOT EXISTS resource_curriculum_alignments_lookup_idx
    ON public.resource_curriculum_alignments (course_id, standard_id, substandard_id);

CREATE INDEX IF NOT EXISTS resource_curriculum_alignments_resource_idx
    ON public.resource_curriculum_alignments (resource_id);

DROP TRIGGER IF EXISTS set_resource_curriculum_alignments_updated_at ON public.resource_curriculum_alignments;
CREATE TRIGGER set_resource_curriculum_alignments_updated_at
BEFORE UPDATE ON public.resource_curriculum_alignments
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Backfill initial resource curriculum alignments from existing resources
INSERT INTO public.resource_curriculum_alignments (
    school_id, resource_id, course_id, domain_id, standard_id
)
SELECT DISTINCT
    r.school_id,
    r.id AS resource_id,
    r.course_id,
    r.domain_id,
    r.standard_id
FROM public.resources r
WHERE r.course_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. Extend test_version_questions with course_id and scoring_key
ALTER TABLE public.test_version_questions
    ADD COLUMN IF NOT EXISTS course_id text,
    ADD COLUMN IF NOT EXISTS scoring_key jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'test_version_questions_course_fk'
    ) THEN
        ALTER TABLE public.test_version_questions
            ADD CONSTRAINT test_version_questions_course_fk
            FOREIGN KEY (course_id) REFERENCES public.curriculum_courses(id)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

-- Populate course_id for existing test_version_questions if missing
UPDATE public.test_version_questions tvq
SET course_id = COALESCE(
    (SELECT qca.course_id FROM public.question_course_alignments qca WHERE qca.question_id = tvq.question_id LIMIT 1),
    'grade-6'
)
WHERE tvq.course_id IS NULL;

-- 4. Student Standard Evaluations Table
CREATE TABLE IF NOT EXISTS public.student_standard_evaluations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    course_id text NOT NULL,
    standard_id text NOT NULL,
    score numeric(4, 2),
    evaluations_count integer NOT NULL DEFAULT 0,
    correct_questions_count integer NOT NULL DEFAULT 0,
    total_questions_count integer NOT NULL DEFAULT 0,
    total_score_awarded numeric(10, 4) NOT NULL DEFAULT 0,
    total_max_score numeric(10, 4) NOT NULL DEFAULT 0,
    last_attempt_id uuid,
    last_evaluated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT student_standard_evaluations_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_standard_evaluations_student_fk
        FOREIGN KEY (student_id) REFERENCES public.student_profiles(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT student_standard_evaluations_course_fk
        FOREIGN KEY (course_id) REFERENCES public.curriculum_courses(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_standard_evaluations_standard_fk
        FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_standard_evaluations_attempt_fk
        FOREIGN KEY (last_attempt_id) REFERENCES public.test_attempts(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT student_standard_evaluations_student_course_std_unique
        UNIQUE (student_id, course_id, standard_id),
    CONSTRAINT student_standard_evaluations_score_range
        CHECK (score IS NULL OR (score >= 0.0 AND score <= 15.0)),
    CONSTRAINT student_standard_evaluations_counts_non_negative
        CHECK (evaluations_count >= 0 AND correct_questions_count >= 0 AND total_questions_count >= 0)
);

CREATE INDEX IF NOT EXISTS student_standard_evaluations_student_course_idx
    ON public.student_standard_evaluations (student_id, course_id);

CREATE INDEX IF NOT EXISTS student_standard_evaluations_standard_idx
    ON public.student_standard_evaluations (standard_id);

DROP TRIGGER IF EXISTS set_student_standard_evaluations_updated_at ON public.student_standard_evaluations;
CREATE TRIGGER set_student_standard_evaluations_updated_at
BEFORE UPDATE ON public.student_standard_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 5. Student Substandard Evaluations Table
CREATE TABLE IF NOT EXISTS public.student_substandard_evaluations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    course_id text NOT NULL,
    substandard_id text NOT NULL,
    standard_id text NOT NULL,
    score numeric(4, 2),
    evaluations_count integer NOT NULL DEFAULT 0,
    correct_questions_count integer NOT NULL DEFAULT 0,
    total_questions_count integer NOT NULL DEFAULT 0,
    total_score_awarded numeric(10, 4) NOT NULL DEFAULT 0,
    total_max_score numeric(10, 4) NOT NULL DEFAULT 0,
    last_attempt_id uuid,
    last_evaluated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT student_substandard_evaluations_school_fk
        FOREIGN KEY (school_id) REFERENCES public.schools(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_substandard_evaluations_student_fk
        FOREIGN KEY (student_id) REFERENCES public.student_profiles(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT student_substandard_evaluations_course_fk
        FOREIGN KEY (course_id) REFERENCES public.curriculum_courses(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_substandard_evaluations_substandard_fk
        FOREIGN KEY (substandard_id) REFERENCES public.curriculum_substandards(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_substandard_evaluations_standard_fk
        FOREIGN KEY (standard_id) REFERENCES public.curriculum_standards(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT student_substandard_evaluations_attempt_fk
        FOREIGN KEY (last_attempt_id) REFERENCES public.test_attempts(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT student_substandard_evaluations_student_course_sub_unique
        UNIQUE (student_id, course_id, substandard_id),
    CONSTRAINT student_substandard_evaluations_score_range
        CHECK (score IS NULL OR (score >= 0.0 AND score <= 15.0)),
    CONSTRAINT student_substandard_evaluations_counts_non_negative
        CHECK (evaluations_count >= 0 AND correct_questions_count >= 0 AND total_questions_count >= 0)
);

CREATE INDEX IF NOT EXISTS student_substandard_evaluations_student_course_idx
    ON public.student_substandard_evaluations (student_id, course_id);

CREATE INDEX IF NOT EXISTS student_substandard_evaluations_substandard_idx
    ON public.student_substandard_evaluations (substandard_id);

DROP TRIGGER IF EXISTS set_student_substandard_evaluations_updated_at ON public.student_substandard_evaluations;
CREATE TRIGGER set_student_substandard_evaluations_updated_at
BEFORE UPDATE ON public.student_substandard_evaluations
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 6. Adjust student_domain_evaluations: allow NULL score (no 5.0 baseline)
ALTER TABLE public.student_domain_evaluations
    ALTER COLUMN score DROP DEFAULT,
    ALTER COLUMN score DROP NOT NULL;

ALTER TABLE public.student_domain_evaluations
    DROP CONSTRAINT IF EXISTS student_domain_evaluations_score_range;

ALTER TABLE public.student_domain_evaluations
    ADD CONSTRAINT student_domain_evaluations_score_range
    CHECK (score IS NULL OR (score >= 0.0 AND score <= 15.0));

-- Reset baseline scores to NULL if they were never genuinely evaluated
UPDATE public.student_domain_evaluations
SET score = NULL
WHERE (is_baseline = true OR total_max_score = 0);

-- 7. Authoritative Curricular Evaluation Engine (PostgreSQL Function)
CREATE OR REPLACE FUNCTION public.recompute_student_curricular_evaluations(p_student_id uuid)
RETURNS void AS $recompute$
DECLARE
    v_school_id uuid;
BEGIN
    SELECT school_id INTO v_school_id FROM public.student_profiles WHERE id = p_student_id;
    IF v_school_id IS NULL THEN
        RETURN;
    END IF;

    -- 7a. Substandard Aggregations (Only questions specifically providing evidence for a substandard)
    WITH valid_attempts AS (
        SELECT DISTINCT ON (ta.test_assignment_id)
            ta.id AS attempt_id,
            ta.school_id,
            ta.student_id,
            ta.submitted_at
        FROM public.test_attempts ta
        WHERE ta.student_id = p_student_id
          AND ta.status = 'graded'
        ORDER BY ta.test_assignment_id, ta.submitted_at DESC NULLS LAST, ta.attempt_number DESC, ta.id DESC
    ),
    evidence AS (
        SELECT
            va.school_id,
            va.student_id,
            va.attempt_id,
            va.submitted_at,
            taq.id AS attempt_question_id,
            COALESCE(
                tvq.course_id,
                (tvq.question_snapshot->>'course_id'),
                (SELECT qca.course_id FROM public.question_course_alignments qca WHERE qca.question_id = tvq.question_id LIMIT 1),
                'grade-6'
            ) AS course_id,
            NULLIF(tvq.question_snapshot->>'standard_id', '') AS standard_id,
            NULLIF(tvq.question_snapshot->>'substandard_id', '') AS substandard_id,
            COALESCE(tvq.points, 1.0) AS points_possible,
            COALESCE(taa.score_awarded, 0.0) AS points_awarded,
            CASE WHEN taa.is_correct = true THEN 1 ELSE 0 END AS is_correct
        FROM valid_attempts va
        JOIN public.test_attempt_questions taq ON taq.attempt_id = va.attempt_id
        JOIN public.test_version_questions tvq ON tvq.id = taq.test_version_question_id
        LEFT JOIN public.test_attempt_answers taa ON taa.attempt_question_id = taq.id
    ),
    substandard_agg AS (
        SELECT
            school_id,
            student_id,
            course_id,
            substandard_id,
            standard_id,
            COUNT(DISTINCT attempt_id) AS eval_count,
            COUNT(*) AS total_q_count,
            SUM(is_correct) AS correct_q_count,
            SUM(points_awarded) AS sum_awarded,
            SUM(points_possible) AS sum_possible,
            (array_agg(attempt_id ORDER BY submitted_at DESC NULLS LAST))[1] AS last_att_id,
            MAX(submitted_at) AS last_sub_at
        FROM evidence
        WHERE substandard_id IS NOT NULL AND standard_id IS NOT NULL
        GROUP BY school_id, student_id, course_id, substandard_id, standard_id
    )
    INSERT INTO public.student_substandard_evaluations (
        school_id, student_id, course_id, substandard_id, standard_id,
        score, evaluations_count, correct_questions_count, total_questions_count,
        total_score_awarded, total_max_score, last_attempt_id, last_evaluated_at, updated_at
    )
    SELECT
        sa.school_id, sa.student_id, sa.course_id, sa.substandard_id, sa.standard_id,
        CASE WHEN sa.sum_possible > 0 THEN ROUND(((sa.sum_awarded / sa.sum_possible) * 15.0)::numeric, 2) ELSE NULL END,
        sa.eval_count, sa.correct_q_count, sa.total_q_count,
        sa.sum_awarded, sa.sum_possible, sa.last_att_id, sa.last_sub_at, now()
    FROM substandard_agg sa
    ON CONFLICT (student_id, course_id, substandard_id) DO UPDATE SET
        score = EXCLUDED.score,
        evaluations_count = EXCLUDED.evaluations_count,
        correct_questions_count = EXCLUDED.correct_questions_count,
        total_questions_count = EXCLUDED.total_questions_count,
        total_score_awarded = EXCLUDED.total_score_awarded,
        total_max_score = EXCLUDED.total_max_score,
        last_attempt_id = EXCLUDED.last_attempt_id,
        last_evaluated_at = EXCLUDED.last_evaluated_at,
        updated_at = now();

    -- 7b. Standard Aggregations
    -- An answer to a substandard feeds the parent standard once.
    -- An answer to a standard feeds the standard.
    WITH valid_attempts AS (
        SELECT DISTINCT ON (ta.test_assignment_id)
            ta.id AS attempt_id,
            ta.school_id,
            ta.student_id,
            ta.submitted_at
        FROM public.test_attempts ta
        WHERE ta.student_id = p_student_id
          AND ta.status = 'graded'
        ORDER BY ta.test_assignment_id, ta.submitted_at DESC NULLS LAST, ta.attempt_number DESC, ta.id DESC
    ),
    evidence AS (
        SELECT
            va.school_id,
            va.student_id,
            va.attempt_id,
            va.submitted_at,
            taq.id AS attempt_question_id,
            COALESCE(
                tvq.course_id,
                (tvq.question_snapshot->>'course_id'),
                (SELECT qca.course_id FROM public.question_course_alignments qca WHERE qca.question_id = tvq.question_id LIMIT 1),
                'grade-6'
            ) AS course_id,
            NULLIF(tvq.question_snapshot->>'standard_id', '') AS standard_id,
            COALESCE(tvq.points, 1.0) AS points_possible,
            COALESCE(taa.score_awarded, 0.0) AS points_awarded,
            CASE WHEN taa.is_correct = true THEN 1 ELSE 0 END AS is_correct
        FROM valid_attempts va
        JOIN public.test_attempt_questions taq ON taq.attempt_id = va.attempt_id
        JOIN public.test_version_questions tvq ON tvq.id = taq.test_version_question_id
        LEFT JOIN public.test_attempt_answers taa ON taa.attempt_question_id = taq.id
    ),
    standard_agg AS (
        SELECT
            school_id,
            student_id,
            course_id,
            standard_id,
            COUNT(DISTINCT attempt_id) AS eval_count,
            COUNT(*) AS total_q_count,
            SUM(is_correct) AS correct_q_count,
            SUM(points_awarded) AS sum_awarded,
            SUM(points_possible) AS sum_possible,
            (array_agg(attempt_id ORDER BY submitted_at DESC NULLS LAST))[1] AS last_att_id,
            MAX(submitted_at) AS last_sub_at
        FROM evidence
        WHERE standard_id IS NOT NULL
        GROUP BY school_id, student_id, course_id, standard_id
    )
    INSERT INTO public.student_standard_evaluations (
        school_id, student_id, course_id, standard_id,
        score, evaluations_count, correct_questions_count, total_questions_count,
        total_score_awarded, total_max_score, last_attempt_id, last_evaluated_at, updated_at
    )
    SELECT
        sta.school_id, sta.student_id, sta.course_id, sta.standard_id,
        CASE WHEN sta.sum_possible > 0 THEN ROUND(((sta.sum_awarded / sta.sum_possible) * 15.0)::numeric, 2) ELSE NULL END,
        sta.eval_count, sta.correct_q_count, sta.total_q_count,
        sta.sum_awarded, sta.sum_possible, sta.last_att_id, sta.last_sub_at, now()
    FROM standard_agg sta
    ON CONFLICT (student_id, course_id, standard_id) DO UPDATE SET
        score = EXCLUDED.score,
        evaluations_count = EXCLUDED.evaluations_count,
        correct_questions_count = EXCLUDED.correct_questions_count,
        total_questions_count = EXCLUDED.total_questions_count,
        total_score_awarded = EXCLUDED.total_score_awarded,
        total_max_score = EXCLUDED.total_max_score,
        last_attempt_id = EXCLUDED.last_attempt_id,
        last_evaluated_at = EXCLUDED.last_evaluated_at,
        updated_at = now();

    -- 7c. Domain Aggregations
    WITH valid_attempts AS (
        SELECT DISTINCT ON (ta.test_assignment_id)
            ta.id AS attempt_id,
            ta.school_id,
            ta.student_id,
            ta.submitted_at
        FROM public.test_attempts ta
        WHERE ta.student_id = p_student_id
          AND ta.status = 'graded'
        ORDER BY ta.test_assignment_id, ta.submitted_at DESC NULLS LAST, ta.attempt_number DESC, ta.id DESC
    ),
    evidence AS (
        SELECT
            va.school_id,
            va.student_id,
            va.attempt_id,
            va.submitted_at,
            taq.id AS attempt_question_id,
            COALESCE(
                NULLIF(tvq.question_snapshot->>'domain_id', ''),
                cd.id,
                'general'
            ) AS domain_id,
            cd.category_id,
            COALESCE(tvq.points, 1.0) AS points_possible,
            COALESCE(taa.score_awarded, 0.0) AS points_awarded,
            CASE WHEN taa.is_correct = true THEN 1 ELSE 0 END AS is_correct
        FROM valid_attempts va
        JOIN public.test_attempt_questions taq ON taq.attempt_id = va.attempt_id
        JOIN public.test_version_questions tvq ON tvq.id = taq.test_version_question_id
        LEFT JOIN public.test_attempt_answers taa ON taa.attempt_question_id = taq.id
        LEFT JOIN public.curriculum_domains cd ON cd.id = (tvq.question_snapshot->>'domain_id')
    ),
    domain_agg AS (
        SELECT
            school_id,
            student_id,
            domain_id,
            category_id,
            COUNT(DISTINCT attempt_id) AS eval_count,
            COUNT(*) AS total_q_count,
            SUM(is_correct) AS correct_q_count,
            SUM(points_awarded) AS sum_awarded,
            SUM(points_possible) AS sum_possible,
            (array_agg(attempt_id ORDER BY submitted_at DESC NULLS LAST))[1] AS last_att_id,
            MAX(submitted_at) AS last_sub_at
        FROM evidence
        GROUP BY school_id, student_id, domain_id, category_id
    )
    INSERT INTO public.student_domain_evaluations (
        school_id, student_id, domain_id, category_id,
        score, is_baseline, evaluations_count, correct_questions_count, total_questions_count,
        total_score_awarded, total_max_score, last_attempt_id, last_evaluated_at, updated_at
    )
    SELECT
        da.school_id, da.student_id, da.domain_id, da.category_id,
        CASE WHEN da.sum_possible > 0 THEN ROUND(((da.sum_awarded / da.sum_possible) * 15.0)::numeric, 2) ELSE NULL END,
        false, da.eval_count, da.correct_q_count, da.total_q_count,
        da.sum_awarded, da.sum_possible, da.last_att_id, da.last_sub_at, now()
    FROM domain_agg da
    ON CONFLICT (student_id, domain_id) DO UPDATE SET
        score = EXCLUDED.score,
        is_baseline = false,
        evaluations_count = EXCLUDED.evaluations_count,
        correct_questions_count = EXCLUDED.correct_questions_count,
        total_questions_count = EXCLUDED.total_questions_count,
        total_score_awarded = EXCLUDED.total_score_awarded,
        total_max_score = EXCLUDED.total_max_score,
        last_attempt_id = EXCLUDED.last_attempt_id,
        last_evaluated_at = EXCLUDED.last_evaluated_at,
        updated_at = now();

END;
$recompute$ LANGUAGE plpgsql;

-- 8. Replace trigger on test_attempts to use the new authoritative recompute function
CREATE OR REPLACE FUNCTION public.fn_sync_student_domain_evaluations()
RETURNS trigger AS $fn$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.recompute_student_curricular_evaluations(OLD.student_id);
        RETURN OLD;
    ELSE
        PERFORM public.recompute_student_curricular_evaluations(NEW.student_id);
        IF TG_OP = 'UPDATE' AND OLD.student_id <> NEW.student_id THEN
            PERFORM public.recompute_student_curricular_evaluations(OLD.student_id);
        END IF;
        RETURN NEW;
    END IF;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_student_domain_evaluations ON public.test_attempts;
CREATE TRIGGER trg_sync_student_domain_evaluations
AFTER INSERT OR UPDATE OF status, score, graded_at OR DELETE ON public.test_attempts
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_student_domain_evaluations();

-- 9. Question Publication Validation: Enforce Course Alignment & Standard on New Publications + Option Validation
CREATE OR REPLACE FUNCTION public.validate_question_publication()
RETURNS trigger AS $fn_pub$
DECLARE
    option_count integer;
    correct_count integer;
BEGIN
    IF NEW.status <> 'published' THEN
        RETURN NEW;
    END IF;

    IF NEW.prompt IS NULL OR length(btrim(NEW.prompt)) = 0 THEN
        RAISE EXCEPTION 'Cannot publish question without prompt.'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.domain_id IS NULL THEN
        RAISE EXCEPTION 'Cannot publish question without domain.'
            USING ERRCODE = '23514';
    END IF;

    -- For newly created questions (from 2026-09-12 onwards), require standard_id
    -- Existing legacy questions created before this date remain published/draft compatible
    IF NEW.created_at >= '2026-09-12 00:00:00+00'::timestamptz THEN
        IF NEW.standard_id IS NULL THEN
            RAISE EXCEPTION 'Cannot publish newly authored question % without a target curriculum standard.', NEW.id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.question_type IN ('single_choice', 'multiple_choice', 'true_false') THEN
        SELECT count(*), count(*) FILTER (WHERE is_correct)
          INTO option_count, correct_count
          FROM public.question_options
         WHERE question_id = NEW.id;

        IF option_count < 2 THEN
            RAISE EXCEPTION 'A published choice question requires at least two options'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.question_type IN ('single_choice', 'true_false') AND correct_count <> 1 THEN
            RAISE EXCEPTION 'A published % question requires exactly one correct option',
                NEW.question_type
                USING ERRCODE = '23514';
        END IF;

        IF NEW.question_type = 'multiple_choice' AND correct_count < 1 THEN
            RAISE EXCEPTION 'A published multiple-choice question requires a correct option'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.question_type = 'true_false' AND option_count <> 2 THEN
            RAISE EXCEPTION 'A published true/false question requires exactly two options'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.question_type = 'numeric'
      AND NOT (NEW.answer_config ? 'correct_value') THEN
        RAISE EXCEPTION 'A published numeric question requires answer_config.correct_value'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$fn_pub$ LANGUAGE plpgsql;

COMMIT;
