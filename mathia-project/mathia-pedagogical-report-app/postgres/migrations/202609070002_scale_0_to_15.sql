-- Migration: Update student_domain_evaluations score scale from 0-10 to 0-15

ALTER TABLE public.student_domain_evaluations
    DROP CONSTRAINT IF EXISTS student_domain_evaluations_score_range;

ALTER TABLE public.student_domain_evaluations
    ALTER COLUMN score TYPE numeric(5, 2);

ALTER TABLE public.student_domain_evaluations
    ADD CONSTRAINT student_domain_evaluations_score_range
    CHECK (score >= 0.0 AND score <= 15.0);

-- Recalculate existing evaluated scores to scale 0 - 15 (if any exist)
UPDATE public.student_domain_evaluations
SET score = ROUND(((total_score_awarded / total_max_score) * 15.0)::numeric, 2),
    updated_at = now()
WHERE is_baseline = false AND total_max_score > 0;

-- Update trigger function to compute on scale 0 - 15
CREATE OR REPLACE FUNCTION public.fn_sync_student_domain_evaluations()
RETURNS trigger AS $fn$
DECLARE
    r RECORD;
    v_score numeric(5, 2);
BEGIN
    FOR r IN
        SELECT
            NEW.school_id AS school_id,
            NEW.student_id AS student_id,
            COALESCE(tvq.question_snapshot->>'domain_id', 'general') AS domain_id,
            cd.category_id AS category_id,
            COUNT(DISTINCT ta.id) AS eval_count,
            COUNT(CASE WHEN taa.is_correct = true THEN 1 END) AS correct_count,
            COUNT(taq.id) AS total_count,
            COALESCE(SUM(taa.score_awarded), 0) AS total_awarded,
            COALESCE(SUM(tvq.points), 0) AS total_possible,
            (array_agg(ta.id ORDER BY ta.submitted_at DESC NULLS LAST))[1] AS last_att_id,
            MAX(ta.submitted_at) AS last_sub_at
        FROM public.test_attempts ta
        JOIN public.test_attempt_questions taq ON taq.attempt_id = ta.id
        JOIN public.test_version_questions tvq ON tvq.id = taq.test_version_question_id
        LEFT JOIN public.test_attempt_answers taa ON taa.attempt_question_id = taq.id
        LEFT JOIN public.curriculum_domains cd ON cd.id = (tvq.question_snapshot->>'domain_id')
        WHERE ta.student_id = NEW.student_id
          AND ta.status IN ('submitted', 'graded')
          AND tvq.question_snapshot->>'domain_id' IS NOT NULL
        GROUP BY tvq.question_snapshot->>'domain_id', cd.category_id
    LOOP
        IF r.total_possible > 0 THEN
            v_score := ROUND(((r.total_awarded / r.total_possible) * 15.0)::numeric, 2);
        ELSE
            v_score := 5.00;
        END IF;

        INSERT INTO public.student_domain_evaluations (
            school_id, student_id, domain_id, category_id,
            score, is_baseline, evaluations_count,
            correct_questions_count, total_questions_count,
            total_score_awarded, total_max_score,
            last_attempt_id, last_evaluated_at
        ) VALUES (
            r.school_id, r.student_id, r.domain_id, r.category_id,
            v_score, false, r.eval_count,
            r.correct_count, r.total_count,
            r.total_awarded, r.total_possible,
            r.last_att_id, r.last_sub_at
        )
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
    END LOOP;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
