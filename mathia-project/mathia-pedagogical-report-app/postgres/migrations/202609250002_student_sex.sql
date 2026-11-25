-- Migration: Add student sex/gender field for profile records and AI prediction
-- 1. Alter student_profiles table with sex column and validation constraint
ALTER TABLE public.student_profiles
    ADD COLUMN IF NOT EXISTS sex text;

ALTER TABLE public.student_profiles
    DROP CONSTRAINT IF EXISTS student_profiles_sex_valid;

ALTER TABLE public.student_profiles
    ADD CONSTRAINT student_profiles_sex_valid CHECK (
        sex IS NULL OR sex IN ('male', 'female', 'other')
    );

COMMENT ON COLUMN public.student_profiles.sex IS
    'Biological sex or gender category (male, female, other) used for demographic records and ML prediction Sexo(M=1)';

-- 2. Update Directus permissions to allow student, teacher, and director to access sex
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

    -- Update student_profiles read fields for Teacher
    IF v_teacher_policy IS NOT NULL THEN
        UPDATE public.directus_permissions
        SET fields = 'active,created_at,date_of_birth,diagnosis_notes,directus_user_id,email,external_id,first_name,has_diagnosis,id,last_name,needs_evaluation,preferred_language,preferred_name,school_id,sex,updated_at'
        WHERE policy = v_teacher_policy AND collection = 'student_profiles' AND action = 'read';
    END IF;

    -- Update student_profiles fields for Director (read, create, update)
    IF v_director_policy IS NOT NULL THEN
        UPDATE public.directus_permissions
        SET fields = 'active,created_at,date_of_birth,diagnosis_notes,directus_user_id,email,external_id,first_name,has_diagnosis,id,last_name,needs_evaluation,preferred_language,preferred_name,school_id,sex,updated_at'
        WHERE policy = v_director_policy AND collection = 'student_profiles' AND action = 'read';

        UPDATE public.directus_permissions
        SET fields = 'active,date_of_birth,diagnosis_notes,directus_user_id,email,external_id,first_name,has_diagnosis,last_name,needs_evaluation,preferred_language,preferred_name,school_id,sex'
        WHERE policy = v_director_policy AND collection = 'student_profiles' AND action = 'create';

        UPDATE public.directus_permissions
        SET fields = 'active,date_of_birth,diagnosis_notes,directus_user_id,email,external_id,first_name,has_diagnosis,last_name,needs_evaluation,preferred_language,preferred_name,sex'
        WHERE policy = v_director_policy AND collection = 'student_profiles' AND action = 'update';
    END IF;

    -- Update student_profiles read fields for Student (own profile)
    IF v_student_policy IS NOT NULL THEN
        UPDATE public.directus_permissions
        SET fields = 'active,created_at,date_of_birth,diagnosis_notes,directus_user_id,email,external_id,first_name,has_diagnosis,id,last_name,needs_evaluation,preferred_language,preferred_name,school_id,sex,updated_at'
        WHERE policy = v_student_policy AND collection = 'student_profiles' AND action = 'read';
    END IF;
END $$;
