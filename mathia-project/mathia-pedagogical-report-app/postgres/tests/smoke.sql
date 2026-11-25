-- Run after all init scripts with psql -v ON_ERROR_STOP=1.
-- The surrounding transaction is rolled back, so this test leaves no data.
BEGIN;

DO $$
DECLARE
    school_id_a uuid := gen_random_uuid();
    school_id_b uuid := gen_random_uuid();
    teacher_id_a uuid := gen_random_uuid();
    student_id_a uuid := gen_random_uuid();
    student_id_b uuid := gen_random_uuid();
    outside_student_id uuid := gen_random_uuid();
    class_id_a uuid := gen_random_uuid();
    resource_id_a uuid := gen_random_uuid();
    test_id_a uuid := gen_random_uuid();
    test_id_b uuid := gen_random_uuid();
    direct_assignment_id uuid := gen_random_uuid();
    class_assignment_id uuid := gen_random_uuid();
    support_prediction_id uuid := gen_random_uuid();
    previous_updated_at timestamptz;
    next_updated_at timestamptz;
BEGIN
    INSERT INTO public.schools (id, name, code, slug)
    VALUES
        (school_id_a, 'Schema Test School A', 'SCHEMA-A', 'schema-test-a'),
        (school_id_b, 'Schema Test School B', 'SCHEMA-B', 'schema-test-b');

    IF (SELECT educational_system FROM public.schools WHERE id = school_id_a) != 'ES' THEN
        RAISE EXCEPTION 'expected default educational_system to be ES';
    END IF;

    UPDATE public.schools SET educational_system = 'IT' WHERE id = school_id_b;
    IF (SELECT educational_system FROM public.schools WHERE id = school_id_b) != 'IT' THEN
        RAISE EXCEPTION 'expected educational_system to be updated to IT';
    END IF;

    INSERT INTO public.teacher_profiles (
        id, school_id, employee_id, first_name, last_name, email
    ) VALUES (
        teacher_id_a,
        school_id_a,
        'TEACHER-1',
        'Ada',
        'Lovelace',
        'ada@example.test'
    );

    INSERT INTO public.student_profiles (
        id, school_id, external_id, first_name, last_name, sex
    ) VALUES
        (student_id_a, school_id_a, 'STUDENT-1', 'Student', 'One', 'male'),
        (student_id_b, school_id_a, 'STUDENT-2', 'Student', 'Two', 'female'),
        (outside_student_id, school_id_b, 'STUDENT-3', 'Student', 'Three', NULL);

    INSERT INTO public.classes (
        id, school_id, name, code, academic_year
    ) VALUES (
        class_id_a,
        school_id_a,
        'Schema Test Class',
        'CLASS-1',
        '2026-2027'
    );

    INSERT INTO public.class_teachers (
        school_id, class_id, teacher_id
    ) VALUES (
        school_id_a, class_id_a, teacher_id_a
    );

    INSERT INTO public.class_students (
        school_id, class_id, student_id
    ) VALUES (
        school_id_a, class_id_a, student_id_a
    );

    SELECT updated_at
      INTO previous_updated_at
      FROM public.classes
     WHERE id = class_id_a;

    PERFORM pg_sleep(0.01);

    UPDATE public.classes
       SET name = 'Schema Test Class Updated'
     WHERE id = class_id_a
     RETURNING updated_at INTO next_updated_at;

    IF next_updated_at <= previous_updated_at THEN
        RAISE EXCEPTION 'expected updated_at trigger to advance the timestamp';
    END IF;

    INSERT INTO public.resources (
        id, school_id, created_by_teacher_id, title, resource_type
    ) VALUES (
        resource_id_a,
        school_id_a,
        teacher_id_a,
        'Schema Test Resource',
        'document'
    );

    INSERT INTO public.resource_assignments (
        school_id, resource_id, class_id, assigned_by_teacher_id
    ) VALUES (
        school_id_a, resource_id_a, class_id_a, teacher_id_a
    );

    INSERT INTO public.tests (
        id, school_id, created_by_teacher_id, title, max_score
    ) VALUES
        (test_id_a, school_id_a, teacher_id_a, 'Schema Test A', 10),
        (test_id_b, school_id_a, teacher_id_a, 'Schema Test B', 10);

    INSERT INTO public.test_assignments (
        id,
        school_id,
        test_id,
        student_id,
        assigned_by_teacher_id,
        enabled
    ) VALUES (
        direct_assignment_id,
        school_id_a,
        test_id_a,
        student_id_a,
        teacher_id_a,
        true
    );

    INSERT INTO public.test_assignments (
        id,
        school_id,
        test_id,
        class_id,
        assigned_by_teacher_id,
        enabled
    ) VALUES (
        class_assignment_id,
        school_id_a,
        test_id_a,
        class_id_a,
        teacher_id_a,
        true
    );

    INSERT INTO public.test_results (
        school_id,
        test_assignment_id,
        student_id,
        status,
        score,
        max_score,
        submitted_at,
        graded_at,
        graded_by_teacher_id
    ) VALUES (
        school_id_a,
        direct_assignment_id,
        student_id_a,
        'graded',
        8,
        10,
        now(),
        now(),
        teacher_id_a
    );

    INSERT INTO public.test_results (
        school_id, test_assignment_id, student_id, status
    ) VALUES (
        school_id_a, class_assignment_id, student_id_a, 'in_progress'
    );

    INSERT INTO public.pedagogical_reports (
        school_id,
        student_id,
        class_id,
        created_by_teacher_id,
        title,
        period_start,
        period_end
    ) VALUES (
        school_id_a,
        student_id_a,
        class_id_a,
        teacher_id_a,
        'Student report',
        DATE '2026-09-01',
        DATE '2026-12-31'
    );

    INSERT INTO public.class_reports (
        school_id,
        class_id,
        created_by_teacher_id,
        title,
        period_start,
        period_end
    ) VALUES (
        school_id_a,
        class_id_a,
        teacher_id_a,
        'Class report',
        DATE '2026-09-01',
        DATE '2026-12-31'
    );

    INSERT INTO public.student_support_predictions (
        id,
        school_id,
        student_id,
        suggests_educational_support,
        status,
        attention_index,
        applied_threshold,
        model_name,
        model_version,
        model_route,
        evidence_level,
        total_responses,
        valid_response_times,
        warnings
    ) VALUES (
        support_prediction_id,
        school_id_a,
        student_id_a,
        true,
        'support_suggested',
        0.75,
        0.66,
        'mathia_pu',
        'schema-v4',
        'con_tiempos',
        'standard',
        100,
        96,
        '["attention_index_is_not_a_diagnostic_probability"]'::jsonb
    );

    BEGIN
        UPDATE public.student_support_predictions
        SET reason = 'This mutation must be rejected'
        WHERE id = support_prediction_id;
        RAISE EXCEPTION 'expected support prediction history to be append-only';
    EXCEPTION
        WHEN raise_exception THEN
            IF SQLERRM <> 'student_support_predictions is append-only' THEN
                RAISE;
            END IF;
    END;

    BEGIN
        INSERT INTO public.student_support_predictions (
            school_id,
            student_id,
            suggests_educational_support,
            status,
            model_name,
            model_version,
            model_route,
            evidence_level,
            total_responses
        ) VALUES (
            school_id_a,
            student_id_a,
            NULL,
            'support_suggested',
            'mathia_pu',
            'schema-v4',
            'sin_prediccion_respuestas_insuficientes',
            'insufficient',
            12
        );
        RAISE EXCEPTION 'expected inconsistent support decision status to be rejected';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.class_students (
            school_id, class_id, student_id
        ) VALUES (
            school_id_a, class_id_a, outside_student_id
        );
        RAISE EXCEPTION 'expected cross-school enrollment to be rejected';
    EXCEPTION
        WHEN foreign_key_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.test_assignments (
            school_id, test_id, class_id, student_id
        ) VALUES (
            school_id_a, test_id_b, class_id_a, student_id_a
        );
        RAISE EXCEPTION 'expected a two-target assignment to be rejected';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.test_results (
            school_id, test_assignment_id, student_id
        ) VALUES (
            school_id_a, direct_assignment_id, student_id_b
        );
        RAISE EXCEPTION 'expected a direct assignment result for another student to be rejected';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.test_results (
            school_id, test_assignment_id, student_id
        ) VALUES (
            school_id_a, class_assignment_id, student_id_b
        );
        RAISE EXCEPTION 'expected a class result without enrollment to be rejected';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE public.test_assignments
           SET student_id = student_id_b
         WHERE id = direct_assignment_id;
        RAISE EXCEPTION 'expected an assignment with results to keep its target';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    -- Negative checks for educational_system
    BEGIN
        INSERT INTO public.schools (id, name, code, slug, educational_system)
        VALUES (gen_random_uuid(), 'Invalid School', 'INV-SYS', 'invalid-sys', 'US');
        RAISE EXCEPTION 'expected invalid educational_system to be rejected';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.schools (id, name, code, slug, educational_system)
        VALUES (gen_random_uuid(), 'Invalid School Null', 'INV-NULL', 'invalid-null', NULL);
        RAISE EXCEPTION 'expected null educational_system to be rejected';
    EXCEPTION
        WHEN not_null_violation THEN NULL;
    END;

    -- Negative checks for student_profiles.sex
    BEGIN
        INSERT INTO public.student_profiles (
            id, school_id, external_id, first_name, last_name, sex
        ) VALUES (
            gen_random_uuid(), school_id_a, 'STUDENT-INV-SEX', 'Student', 'Inv', 'alien'
        );
        RAISE EXCEPTION 'expected invalid student sex to be rejected';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    RAISE NOTICE 'PostgreSQL schema smoke test passed';
END;
$$;

ROLLBACK;
