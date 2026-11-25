-- SQL Smoke Test: Curricular evaluation to Standard and Substandard
-- Verifies:
-- 1. Course + Standard context isolation (grade-9 vs grade-10)
-- 2. Substandard evidence propagation to parent standard exactly once
-- 3. Standard-only evidence does not propagate down to substandards
-- 4. 0-15 scale calculation
-- 5. Null score for unassessed objectives (no 5.0 baseline)

BEGIN;

DO $test$
DECLARE
    v_school_id uuid;
    v_student_id uuid;
    v_assignment_id uuid;
    v_class_id uuid;
    v_test_id uuid;
    v_version_id uuid;
    v_q1_id uuid;
    v_q2_id uuid;
    v_vq1_id uuid;
    v_vq2_id uuid;
    v_attempt_id uuid;
    v_aq1_id uuid;
    v_aq2_id uuid;
    v_g9_score numeric(4, 2);
    v_sub_score numeric(4, 2);
    v_g10_count integer;
BEGIN
    SELECT id INTO v_school_id FROM public.schools WHERE slug = 'mathia-school';
    SELECT id INTO v_student_id FROM public.student_profiles WHERE school_id = v_school_id LIMIT 1;

    -- Create test fixtures in transaction
    INSERT INTO public.tests (school_id, title, status)
    VALUES (v_school_id, 'Curriculum Smoke Test', 'published')
    RETURNING id INTO v_test_id;

    INSERT INTO public.test_versions (school_id, test_id, version_number, status, max_score)
    VALUES (v_school_id, v_test_id, 1, 'published', 2.0)
    RETURNING id INTO v_version_id;

    -- Q1: Aligned to grade-9, Standard HSA-SSE.A.1, Substandard HSA-SSE.A.1a
    INSERT INTO public.question_bank_items (
        school_id, prompt, question_type, status, domain_id, cluster_id, standard_id, substandard_id, published_at
    ) VALUES (
        v_school_id, 'Factor 3x + 6', 'single_choice', 'published', 'HSA-SSE', 'HSA-SSE.A', 'HSA-SSE.A.1', 'HSA-SSE.A.1a', now()
    ) RETURNING id INTO v_q1_id;

    INSERT INTO public.question_course_alignments (school_id, question_id, course_id)
    VALUES (v_school_id, v_q1_id, 'grade-9');

    -- Q2: Aligned to grade-9, Standard HSA-SSE.A.1 only (holistic evaluation, no substandard)
    INSERT INTO public.question_bank_items (
        school_id, prompt, question_type, status, domain_id, cluster_id, standard_id, substandard_id, published_at
    ) VALUES (
        v_school_id, 'Identify terms in expression', 'single_choice', 'published', 'HSA-SSE', 'HSA-SSE.A', 'HSA-SSE.A.1', NULL, now()
    ) RETURNING id INTO v_q2_id;

    INSERT INTO public.question_course_alignments (school_id, question_id, course_id)
    VALUES (v_school_id, v_q2_id, 'grade-9');

    -- Version questions with course_id and snapshots
    INSERT INTO public.test_version_questions (
        school_id, test_version_id, question_id, canonical_position, points, course_id, question_snapshot
    ) VALUES (
        v_school_id, v_version_id, v_q1_id, 1, 1.0, 'grade-9',
        jsonb_build_object(
            'id', v_q1_id, 'prompt', 'Factor 3x + 6', 'course_id', 'grade-9',
            'domain_id', 'HSA-SSE', 'standard_id', 'HSA-SSE.A.1', 'substandard_id', 'HSA-SSE.A.1a'
        )
    ) RETURNING id INTO v_vq1_id;

    INSERT INTO public.test_version_questions (
        school_id, test_version_id, question_id, canonical_position, points, course_id, question_snapshot
    ) VALUES (
        v_school_id, v_version_id, v_q2_id, 2, 1.0, 'grade-9',
        jsonb_build_object(
            'id', v_q2_id, 'prompt', 'Identify terms', 'course_id', 'grade-9',
            'domain_id', 'HSA-SSE', 'standard_id', 'HSA-SSE.A.1', 'substandard_id', NULL
        )
    ) RETURNING id INTO v_vq2_id;

    -- Create test assignment
    INSERT INTO public.test_assignments (
        school_id, test_id, test_version_id, student_id, assigned_by_teacher_id, enabled
    ) VALUES (
        v_school_id, v_test_id, v_version_id, v_student_id,
        (SELECT id FROM public.teacher_profiles WHERE school_id = v_school_id LIMIT 1),
        true
    ) RETURNING id INTO v_assignment_id;

    -- Create attempt
    INSERT INTO public.test_attempts (
        school_id, test_assignment_id, test_version_id, student_id, attempt_number,
        random_seed, status, started_at, submitted_at, max_score
    ) VALUES (
        v_school_id, v_assignment_id, v_version_id, v_student_id, 1,
        'smoke_test_seed', 'in_progress', now(), now(), 2.0
    ) RETURNING id INTO v_attempt_id;

    -- Attempt questions
    INSERT INTO public.test_attempt_questions (school_id, attempt_id, test_version_question_id, display_position)
    VALUES (v_school_id, v_attempt_id, v_vq1_id, 1) RETURNING id INTO v_aq1_id;

    INSERT INTO public.test_attempt_questions (school_id, attempt_id, test_version_question_id, display_position)
    VALUES (v_school_id, v_attempt_id, v_vq2_id, 2) RETURNING id INTO v_aq2_id;

    -- Answers: Q1 correct (1.0 / 1.0), Q2 incorrect (0.0 / 1.0)
    INSERT INTO public.test_attempt_answers (
        school_id, attempt_question_id, answer_payload, is_correct, score_awarded
    ) VALUES (
        v_school_id, v_aq1_id, '{"selected": "opt-1"}'::jsonb, true, 1.0
    );

    INSERT INTO public.test_attempt_answers (
        school_id, attempt_question_id, answer_payload, is_correct, score_awarded
    ) VALUES (
        v_school_id, v_aq2_id, '{"selected": "opt-2"}'::jsonb, false, 0.0
    );

    -- Transition attempt to graded (fires fn_sync_student_domain_evaluations -> recompute_student_curricular_evaluations)
    UPDATE public.test_attempts
    SET status = 'graded', score = 1.0, graded_at = now()
    WHERE id = v_attempt_id;

    -- Verify standard evaluation in grade-9: 1 awarded out of 2 possible = 15 * (1/2) = 7.50
    SELECT score INTO v_g9_score
    FROM public.student_standard_evaluations
    WHERE student_id = v_student_id AND course_id = 'grade-9' AND standard_id = 'HSA-SSE.A.1';

    ASSERT v_g9_score = 7.50, format('Expected grade-9 HSA-SSE.A.1 score 7.50, got %s', v_g9_score);

    -- Verify substandard evaluation in grade-9: Q1 was 1.0 out of 1.0 = 15.00
    SELECT score INTO v_sub_score
    FROM public.student_substandard_evaluations
    WHERE student_id = v_student_id AND course_id = 'grade-9' AND substandard_id = 'HSA-SSE.A.1a';

    ASSERT v_sub_score = 15.00, format('Expected grade-9 HSA-SSE.A.1a score 15.00, got %s', v_sub_score);

    -- Verify course context isolation: NO evaluation in grade-10 for HSA-SSE.A.1
    SELECT count(*) INTO v_g10_count
    FROM public.student_standard_evaluations
    WHERE student_id = v_student_id AND course_id = 'grade-10' AND standard_id = 'HSA-SSE.A.1';

    ASSERT v_g10_count = 0, format('Expected 0 grade-10 evaluations, got %s', v_g10_count);

    -- Legacy publications omitted course_id in both the row and snapshot.
    -- Without a unique question alignment, use the assigned class, never grade-6.
    INSERT INTO public.classes (school_id, name, code, academic_year, grade_level)
    VALUES (v_school_id, 'Course context regression', 'COURSE-CONTEXT-TEST', '2026-2027', 'grade-10')
    RETURNING id INTO v_class_id;

    UPDATE public.test_assignments SET class_id = v_class_id, student_id = NULL
    WHERE id = v_assignment_id;
    UPDATE public.test_version_questions
    SET course_id = NULL, question_snapshot = question_snapshot - 'course_id'
    WHERE id IN (v_vq1_id, v_vq2_id);
    DELETE FROM public.question_course_alignments WHERE question_id IN (v_q1_id, v_q2_id);

    PERFORM public.recompute_student_curricular_evaluations(v_student_id);
    SELECT score INTO v_g9_score FROM public.student_standard_evaluations
    WHERE student_id = v_student_id AND course_id = 'grade-10' AND standard_id = 'HSA-SSE.A.1';
    ASSERT v_g9_score = 7.50, 'Legacy questions must use the assigned class course';
    SELECT score INTO v_sub_score FROM public.student_substandard_evaluations
    WHERE student_id = v_student_id AND course_id = 'grade-10' AND substandard_id = 'HSA-SSE.A.1a';
    ASSERT v_sub_score = 15.00, 'Substandards must use the assigned class course';
    ASSERT NOT EXISTS (
        SELECT 1 FROM public.student_standard_evaluations
        WHERE student_id = v_student_id AND course_id IN ('grade-6', 'grade-9') AND standard_id = 'HSA-SSE.A.1'
    ), 'Recomputation must remove obsolete course evaluations';

    -- Multiple alignments must not pick an arbitrary first course.
    INSERT INTO public.question_course_alignments (school_id, question_id, course_id)
    SELECT v_school_id, q, c FROM unnest(ARRAY[v_q1_id, v_q2_id]) q
    CROSS JOIN unnest(ARRAY['grade-9', 'grade-10']) c;
    PERFORM public.recompute_student_curricular_evaluations(v_student_id);
    SELECT score INTO v_g9_score FROM public.student_standard_evaluations
    WHERE student_id = v_student_id AND course_id = 'grade-10' AND standard_id = 'HSA-SSE.A.1';
    ASSERT v_g9_score = 7.50, 'Assigned class must resolve multiple question alignments';

    -- A unique question alignment supplies context for individually assigned tests.
    DELETE FROM public.question_course_alignments
    WHERE question_id IN (v_q1_id, v_q2_id) AND course_id = 'grade-10';
    UPDATE public.test_assignments SET class_id = NULL, student_id = v_student_id WHERE id = v_assignment_id;
    PERFORM public.recompute_student_curricular_evaluations(v_student_id);
    SELECT score INTO v_g9_score FROM public.student_standard_evaluations
    WHERE student_id = v_student_id AND course_id = 'grade-9' AND standard_id = 'HSA-SSE.A.1';
    ASSERT v_g9_score = 7.50, 'Unique alignment must resolve individually assigned tests';

    -- Explicit snapshots still override the class/alignment fallback.
    UPDATE public.test_version_questions
    SET question_snapshot = question_snapshot || '{"course_id":"grade-10"}'::jsonb
    WHERE id IN (v_vq1_id, v_vq2_id);
    PERFORM public.recompute_student_curricular_evaluations(v_student_id);
    SELECT score INTO v_g9_score FROM public.student_standard_evaluations
    WHERE student_id = v_student_id AND course_id = 'grade-10' AND standard_id = 'HSA-SSE.A.1';
    ASSERT v_g9_score = 7.50, 'Explicit snapshot course must take precedence';

    RAISE NOTICE 'SUCCESS: All curricular evaluation assertions passed!';
END $test$;

ROLLBACK;
