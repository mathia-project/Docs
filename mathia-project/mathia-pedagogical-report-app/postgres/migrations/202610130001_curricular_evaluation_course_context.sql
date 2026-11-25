-- Resolve legacy question snapshots without inventing a grade-6 course.
-- Explicit question course wins; a unique alignment, assigned class, or unique
-- standard mapping supplies missing context. Ambiguous evidence stays unassigned.
BEGIN;

CREATE OR REPLACE FUNCTION public.recompute_student_curricular_evaluations(p_student_id uuid)
RETURNS void AS $recompute$
DECLARE
    v_school_id uuid;
BEGIN
    SELECT school_id INTO v_school_id FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
    IF v_school_id IS NULL THEN
        RETURN;
    END IF;

    -- These tables are derived from graded attempts. Rebuild them so a corrected
    -- course or a removed/voided attempt cannot leave obsolete evaluations behind.
    DELETE FROM public.student_substandard_evaluations WHERE student_id = p_student_id;
    DELETE FROM public.student_standard_evaluations WHERE student_id = p_student_id;

    -- 7a. Substandard Aggregations (Only questions specifically providing evidence for a substandard)
    WITH valid_attempts AS (
        SELECT DISTINCT ON (ta.test_assignment_id)
            ta.id AS attempt_id,
            ta.school_id,
            ta.student_id,
            ta.submitted_at,
            assigned_class.grade_level AS assigned_course_id
        FROM public.test_attempts ta
        JOIN public.test_assignments assignment ON assignment.id = ta.test_assignment_id
        LEFT JOIN public.classes assigned_class ON assigned_class.id = assignment.class_id
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
                NULLIF(tvq.question_snapshot->>'course_id', ''),
                (SELECT min(qca.course_id) FROM public.question_course_alignments qca
                 WHERE qca.question_id = tvq.question_id HAVING count(*) = 1),
                va.assigned_course_id,
                (SELECT min(ccs.course_id) FROM public.curriculum_course_standards ccs
                 WHERE ccs.standard_id = tvq.question_snapshot->>'standard_id'
                 HAVING count(*) = 1)
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
        WHERE substandard_id IS NOT NULL AND standard_id IS NOT NULL AND course_id IS NOT NULL
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
            ta.submitted_at,
            assigned_class.grade_level AS assigned_course_id
        FROM public.test_attempts ta
        JOIN public.test_assignments assignment ON assignment.id = ta.test_assignment_id
        LEFT JOIN public.classes assigned_class ON assigned_class.id = assignment.class_id
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
                NULLIF(tvq.question_snapshot->>'course_id', ''),
                (SELECT min(qca.course_id) FROM public.question_course_alignments qca
                 WHERE qca.question_id = tvq.question_id HAVING count(*) = 1),
                va.assigned_course_id,
                (SELECT min(ccs.course_id) FROM public.curriculum_course_standards ccs
                 WHERE ccs.standard_id = tvq.question_snapshot->>'standard_id'
                 HAVING count(*) = 1)
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
        WHERE standard_id IS NOT NULL AND course_id IS NOT NULL
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
            ta.submitted_at,
            assigned_class.grade_level AS assigned_course_id
        FROM public.test_attempts ta
        JOIN public.test_assignments assignment ON assignment.id = ta.test_assignment_id
        LEFT JOIN public.classes assigned_class ON assigned_class.id = assignment.class_id
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

-- Repair derived evaluations for existing students using the same engine as grading.
DO $backfill$
DECLARE
    v_student_id uuid;
BEGIN
    FOR v_student_id IN SELECT DISTINCT student_id FROM public.test_attempts
    LOOP
        PERFORM public.recompute_student_curricular_evaluations(v_student_id);
    END LOOP;
END;
$backfill$;

COMMIT;
