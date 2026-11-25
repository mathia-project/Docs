-- Migration: Add educational_system field to schools for institutional curriculum framework tracking
-- 1. Alter schools table with educational_system column
ALTER TABLE public.schools
    ADD COLUMN IF NOT EXISTS educational_system text;

-- 2. Explicit backfill for existing records to 'ES'
UPDATE public.schools
    SET educational_system = 'ES'
    WHERE educational_system IS NULL;

-- 3. Set default value and NOT NULL constraint
ALTER TABLE public.schools
    ALTER COLUMN educational_system SET DEFAULT 'ES';

ALTER TABLE public.schools
    ALTER COLUMN educational_system SET NOT NULL;

-- 4. Constraint CHECK: educational_system in ('ES', 'IT')
ALTER TABLE public.schools
    DROP CONSTRAINT IF EXISTS schools_educational_system_valid;

ALTER TABLE public.schools
    DROP CONSTRAINT IF EXISTS schools_educational_system_check;

ALTER TABLE public.schools
    ADD CONSTRAINT schools_educational_system_valid CHECK (
        educational_system IN ('ES', 'IT')
    );

COMMENT ON COLUMN public.schools.educational_system IS
    'Educational system of the school (restricted to ES or IT)';

-- 5. Update Directus permissions to allow student, teacher, and director to access educational_system
DO $$
DECLARE
    v_teacher_policy UUID;
    v_director_policy UUID;
    v_student_policy UUID;
BEGIN
    -- Directus system tables do not exist during fresh PostgreSQL initialization.
    IF to_regclass('public.directus_policies') IS NULL THEN
        RETURN;
    END IF;
    SELECT id INTO v_teacher_policy FROM public.directus_policies WHERE name = 'Mathia Teacher API';
    SELECT id INTO v_director_policy FROM public.directus_policies WHERE name = 'Mathia Director API';
    SELECT id INTO v_student_policy FROM public.directus_policies WHERE name = 'Mathia Student API';

    -- Update schools read fields for Teacher
    IF v_teacher_policy IS NOT NULL THEN
        UPDATE public.directus_permissions
        SET fields = 'active,code,created_at,default_language,educational_system,id,name,slug,time_zone,updated_at'
        WHERE policy = v_teacher_policy AND collection = 'schools' AND action = 'read';
    END IF;

    -- Update schools read & update fields for Director
    IF v_director_policy IS NOT NULL THEN
        UPDATE public.directus_permissions
        SET fields = 'active,code,created_at,default_language,educational_system,id,name,slug,time_zone,updated_at'
        WHERE policy = v_director_policy AND collection = 'schools' AND action = 'read';

        UPDATE public.directus_permissions
        SET fields = 'active,code,default_language,educational_system,name,slug,time_zone'
        WHERE policy = v_director_policy AND collection = 'schools' AND action = 'update';
    END IF;

    -- Update schools read fields for Student
    IF v_student_policy IS NOT NULL THEN
        UPDATE public.directus_permissions
        SET fields = 'active,code,created_at,default_language,educational_system,id,name,slug,time_zone,updated_at'
        WHERE policy = v_student_policy AND collection = 'schools' AND action = 'read';
    END IF;
END $$;
