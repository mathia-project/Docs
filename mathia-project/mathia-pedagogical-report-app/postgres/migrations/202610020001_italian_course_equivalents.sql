BEGIN;

ALTER TABLE public.curriculum_courses
    ADD COLUMN IF NOT EXISTS italian_equivalent jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'curriculum_courses_italian_equivalent_object'
          AND conrelid = 'public.curriculum_courses'::regclass
    ) THEN
        ALTER TABLE public.curriculum_courses
            ADD CONSTRAINT curriculum_courses_italian_equivalent_object
            CHECK (italian_equivalent IS NULL OR jsonb_typeof(italian_equivalent) = 'object');
    END IF;
END;
$$;

UPDATE public.curriculum_courses AS course
SET name = course.name || jsonb_build_object('it', mapping.short_name),
    italian_equivalent = jsonb_build_object(
        'system', 'IT',
        'name', jsonb_build_object('en', mapping.english_name, 'it', mapping.official_name),
        'basis', 'user_defined_course_alignment'
    ),
    updated_at = now()
FROM (VALUES
    ('grade-6', '1ª Media', 'Year 1 of Lower Secondary Education', '1° anno della scuola secondaria di primo grado'),
    ('grade-7', '2ª Media', 'Year 2 of Lower Secondary Education', '2° anno della scuola secondaria di primo grado'),
    ('grade-8', '3ª Media', 'Year 3 of Lower Secondary Education', '3° anno della scuola secondaria di primo grado'),
    ('grade-9', '1ª Superiore', 'Year 1 of Upper Secondary Education', '1° anno della scuola secondaria di secondo grado'),
    ('grade-10', '2ª Superiore', 'Year 2 of Upper Secondary Education', '2° anno della scuola secondaria di secondo grado')
) AS mapping(id, short_name, english_name, official_name)
WHERE course.id = mapping.id;

COMMIT;
