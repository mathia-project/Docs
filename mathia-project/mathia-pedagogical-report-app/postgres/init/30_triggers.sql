BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

-- Install the same timestamp behavior consistently without copying thirteen
-- almost-identical trigger definitions. Dropping/recreating makes this script
-- safe to run again during local development.
DO $$
DECLARE
    table_name text;
    trigger_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'schools',
        'student_profiles',
        'teacher_profiles',
        'classes',
        'class_students',
        'class_teachers',
        'resources',
        'resource_assignments',
        'curriculum_categories',
        'curriculum_courses',
        'curriculum_domains',
        'curriculum_clusters',
        'curriculum_standards',
        'curriculum_substandards',
        'curriculum_course_domains',
        'curriculum_course_standards',
        'curriculum_course_substandards',
        'curriculum_lookup_aliases',
        'question_bank_items',
        'question_options',
        'tests',
        'test_assignments',
        'test_results',
        'pedagogical_reports',
        'class_reports'
    ]
    LOOP
        trigger_name := 'set_' || table_name || '_updated_at';

        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON public.%I',
            trigger_name,
            table_name
        );

        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
            || 'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
            trigger_name,
            table_name
        );
    END LOOP;
END;
$$;

-- A result assigned directly to a student must belong to that student. A
-- result assigned to a class must belong to a student who has an enrollment
-- record in that class. This closes a gap that cannot be expressed with a
-- simple foreign key while retaining the useful class-or-student assignment.
CREATE OR REPLACE FUNCTION public.validate_test_result_assignee()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    assignment_school_id uuid;
    assignment_class_id uuid;
    assignment_student_id uuid;
BEGIN
    SELECT school_id, class_id, student_id
      INTO assignment_school_id, assignment_class_id, assignment_student_id
      FROM public.test_assignments
     WHERE id = NEW.test_assignment_id;

    -- Let the foreign key report a missing assignment with its standard error.
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    IF assignment_school_id <> NEW.school_id THEN
        RAISE EXCEPTION
            'test result school (%) does not match assignment school (%)',
            NEW.school_id,
            assignment_school_id
            USING ERRCODE = '23514';
    END IF;

    IF assignment_student_id IS NOT NULL THEN
        IF assignment_student_id <> NEW.student_id THEN
            RAISE EXCEPTION
                'test result student (%) does not match assigned student (%)',
                NEW.student_id,
                assignment_student_id
                USING ERRCODE = '23514';
        END IF;
    ELSIF NOT EXISTS (
        SELECT 1
          FROM public.class_students
         WHERE school_id = NEW.school_id
           AND class_id = assignment_class_id
           AND student_id = NEW.student_id
    ) THEN
        RAISE EXCEPTION
            'student (%) has no enrollment in assigned class (%)',
            NEW.student_id,
            assignment_class_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_test_result_assignee
    ON public.test_results;

CREATE TRIGGER validate_test_result_assignee
BEFORE INSERT OR UPDATE OF school_id, test_assignment_id, student_id
ON public.test_results
FOR EACH ROW
EXECUTE FUNCTION public.validate_test_result_assignee();

-- Once results exist, changing an assignment's tenant, test or target would
-- reinterpret historical data. Metadata such as dates and enabled state can
-- still be edited safely.
CREATE OR REPLACE FUNCTION public.protect_test_assignment_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM public.test_results
         WHERE test_assignment_id = OLD.id
    ) AND (
        NEW.school_id IS DISTINCT FROM OLD.school_id
        OR NEW.test_id IS DISTINCT FROM OLD.test_id
        OR NEW.class_id IS DISTINCT FROM OLD.class_id
        OR NEW.student_id IS DISTINCT FROM OLD.student_id
    ) THEN
        RAISE EXCEPTION
            'cannot change the identity or target of a test assignment with results'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_test_assignment_identity
    ON public.test_assignments;

CREATE TRIGGER protect_test_assignment_identity
BEFORE UPDATE OF school_id, test_id, class_id, student_id
ON public.test_assignments
FOR EACH ROW
EXECUTE FUNCTION public.protect_test_assignment_identity();

-- Validate resource curriculum hierarchy and course-domain availability
CREATE OR REPLACE FUNCTION public.validate_resource_curriculum_path()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    resolved_category_id text;
    domain_in_course boolean;
BEGIN
    IF NEW.domain_id IS NOT NULL THEN
        SELECT category_id INTO resolved_category_id
        FROM public.curriculum_domains
        WHERE id = NEW.domain_id;

        IF NEW.category_id IS NOT NULL AND resolved_category_id IS DISTINCT FROM NEW.category_id THEN
            RAISE EXCEPTION 'Resource domain (%) does not belong to category (%)',
                NEW.domain_id, NEW.category_id
                USING ERRCODE = '23514';
        END IF;

        IF NEW.category_id IS NULL AND resolved_category_id IS NOT NULL THEN
            NEW.category_id := resolved_category_id;
        END IF;
    END IF;

    IF NEW.course_id IS NOT NULL AND NEW.domain_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.curriculum_course_domains
            WHERE course_id = NEW.course_id AND domain_id = NEW.domain_id
        ) INTO domain_in_course;

        IF NOT domain_in_course THEN
            RAISE EXCEPTION 'Resource domain (%) is not available in course (%)',
                NEW.domain_id, NEW.course_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resources_curriculum_path_guard ON public.resources;
CREATE TRIGGER resources_curriculum_path_guard
    BEFORE INSERT OR UPDATE OF course_id, category_id, domain_id
    ON public.resources
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_resource_curriculum_path();

COMMIT;
