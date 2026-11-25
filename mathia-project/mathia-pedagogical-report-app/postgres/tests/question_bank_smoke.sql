-- Transactional integration checks for curriculum and question-bank integrity.
BEGIN;

DO $$
DECLARE
    school_id_value uuid := gen_random_uuid();
    other_school_id_value uuid := gen_random_uuid();
    teacher_id_value uuid := gen_random_uuid();
    question_id_value uuid := gen_random_uuid();
    invalid_question_id_value uuid := gen_random_uuid();
BEGIN
    IF (SELECT count(*) FROM public.curriculum_categories WHERE active) <> 5 THEN
        RAISE EXCEPTION 'expected 5 active curriculum categories';
    END IF;

    IF (SELECT count(*) FROM public.curriculum_standards WHERE active) <> 181 THEN
        RAISE EXCEPTION 'expected 181 active curriculum standards';
    END IF;

    IF (SELECT count(*) FROM public.curriculum_substandards WHERE active) <> 68 THEN
        RAISE EXCEPTION 'expected 68 active curriculum substandards';
    END IF;

    INSERT INTO public.schools (id, name, code, slug)
    VALUES
        (school_id_value, 'Question Bank Test School', 'QB-TEST', 'question-bank-test'),
        (other_school_id_value, 'Question Bank Other School', 'QB-OTHER', 'question-bank-other');

    INSERT INTO public.teacher_profiles (
        id, school_id, first_name, last_name, preferred_language
    ) VALUES (
        teacher_id_value, school_id_value, 'Grace', 'Hopper', 'en'
    );

    INSERT INTO public.question_bank_items (
        id,
        school_id,
        created_by_teacher_id,
        external_id,
        question_type,
        prompt,
        domain_id,
        cluster_id,
        standard_id,
        visibility,
        status
    ) VALUES (
        question_id_value,
        school_id_value,
        teacher_id_value,
        'QB-SMOKE-1',
        'single_choice',
        'What is the reciprocal of 3/4?',
        '6.NS',
        '6.NS.A',
        '6.NS.A.1',
        'private',
        'draft'
    );

    BEGIN
        INSERT INTO public.question_bank_items (
            id, school_id, question_type, prompt, domain_id, cluster_id
        ) VALUES (
            invalid_question_id_value,
            school_id_value,
            'numeric',
            'This hierarchy must fail',
            '6.NS',
            '7.NS.A'
        );
        RAISE EXCEPTION 'expected an inconsistent curriculum path to be rejected';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.question_options (
            school_id, question_id, option_key, content, is_correct, position
        ) VALUES (
            other_school_id_value, question_id_value, 'X', 'Invalid scope', false, 0
        );
        RAISE EXCEPTION 'expected a cross-school option to be rejected';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    INSERT INTO public.question_options (
        school_id, question_id, option_key, content, is_correct, position
    ) VALUES
        (school_id_value, question_id_value, 'A', '3/4', false, 0),
        (school_id_value, question_id_value, 'B', '4/3', true, 1),
        (school_id_value, question_id_value, 'C', '1/4', false, 2);

    UPDATE public.question_bank_items
       SET status = 'published', published_at = now()
     WHERE id = question_id_value;

    SET CONSTRAINTS question_bank_items_publication_guard IMMEDIATE;

    BEGIN
        UPDATE public.question_options
           SET content = 'Changed after publication'
         WHERE question_id = question_id_value
           AND option_key = 'A';
        RAISE EXCEPTION 'expected published question options to be immutable';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    SET CONSTRAINTS question_bank_items_publication_guard DEFERRED;

    BEGIN
        INSERT INTO public.question_bank_items (
            id,
            school_id,
            question_type,
            prompt,
            domain_id,
            visibility,
            status,
            published_at
        ) VALUES (
            gen_random_uuid(),
            school_id_value,
            'single_choice',
            'A choice question without options',
            '6.NS',
            'private',
            'published',
            now()
        );
        SET CONSTRAINTS question_bank_items_publication_guard IMMEDIATE;
        RAISE EXCEPTION 'expected an incomplete published question to be rejected';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    RAISE NOTICE 'Curriculum and question-bank smoke test passed';
END
$$;

ROLLBACK;
