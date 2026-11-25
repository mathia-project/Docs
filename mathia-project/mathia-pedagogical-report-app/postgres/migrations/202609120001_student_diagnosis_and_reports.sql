-- Migration: Add student diagnosis fields and update pedagogical reports permissions
-- 1. Alter student_profiles table with diagnosis & evaluation suggestion fields
ALTER TABLE public.student_profiles
    ADD COLUMN IF NOT EXISTS has_diagnosis BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS needs_evaluation BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS diagnosis_notes TEXT DEFAULT NULL;

COMMENT ON COLUMN public.student_profiles.has_diagnosis IS 'Indicates whether the student has an official or prior diagnosis';
COMMENT ON COLUMN public.student_profiles.needs_evaluation IS 'AI/Pedagogical recommendation flag suggesting diagnostic evaluation (only applicable when has_diagnosis is false)';
COMMENT ON COLUMN public.student_profiles.diagnosis_notes IS 'Optional clinical or pedagogical notes detailing the diagnosed condition';

-- 2. Update Directus permissions to allow teachers and directors to manage and view diagnosis fields
DO $$
DECLARE
    v_teacher_policy UUID;
    v_director_policy UUID;
    v_admin_policy UUID;
BEGIN
    -- Fresh databases are initialized before Directus creates its system tables.
    -- The Directus bootstrap applies the current permission manifest afterward.
    IF to_regclass('public.directus_policies') IS NULL THEN
        RETURN;
    END IF;
    SELECT id INTO v_teacher_policy FROM public.directus_policies WHERE name = 'Mathia Teacher API';
    SELECT id INTO v_director_policy FROM public.directus_policies WHERE name = 'Mathia Director API';

    -- Update student_profiles read fields for Teacher
    IF v_teacher_policy IS NOT NULL THEN
        UPDATE public.directus_permissions
        SET fields = 'active,created_at,date_of_birth,diagnosis_notes,directus_user_id,email,external_id,first_name,has_diagnosis,id,last_name,needs_evaluation,preferred_language,preferred_name,school_id,updated_at'
        WHERE policy = v_teacher_policy AND collection = 'student_profiles' AND action = 'read';

        -- Allow Teacher to create pedagogical_reports
        IF NOT EXISTS (
            SELECT 1 FROM public.directus_permissions
            WHERE policy = v_teacher_policy AND collection = 'pedagogical_reports' AND action = 'create'
        ) THEN
            INSERT INTO public.directus_permissions (policy, collection, action, permissions, validation, presets, fields)
            VALUES (
                v_teacher_policy,
                'pedagogical_reports',
                'create',
                '{}',
                '{}',
                json_build_object('school_id', '$CURRENT_USER.school_id'),
                'class_id,created_by_teacher_id,finalized_at,generated_at,generation_context,language,model_name,model_version,narrative,period_end,period_start,reviewed_at,school_id,status,structured_content,student_id,title,version'
            );
        END IF;
    END IF;

    -- Update student_profiles fields for Director
    IF v_director_policy IS NOT NULL THEN
        UPDATE public.directus_permissions
        SET fields = 'active,created_at,date_of_birth,diagnosis_notes,directus_user_id,email,external_id,first_name,has_diagnosis,id,last_name,needs_evaluation,preferred_language,preferred_name,school_id,updated_at'
        WHERE policy = v_director_policy AND collection = 'student_profiles' AND action = 'read';

        UPDATE public.directus_permissions
        SET fields = 'active,date_of_birth,diagnosis_notes,directus_user_id,email,external_id,first_name,has_diagnosis,last_name,needs_evaluation,preferred_language,preferred_name,school_id'
        WHERE policy = v_director_policy AND collection = 'student_profiles' AND action = 'create';

        UPDATE public.directus_permissions
        SET fields = 'active,date_of_birth,diagnosis_notes,directus_user_id,email,external_id,first_name,has_diagnosis,last_name,needs_evaluation,preferred_language,preferred_name'
        WHERE policy = v_director_policy AND collection = 'student_profiles' AND action = 'update';

        -- Allow Director to create pedagogical_reports
        IF NOT EXISTS (
            SELECT 1 FROM public.directus_permissions
            WHERE policy = v_director_policy AND collection = 'pedagogical_reports' AND action = 'create'
        ) THEN
            INSERT INTO public.directus_permissions (policy, collection, action, permissions, validation, presets, fields)
            VALUES (
                v_director_policy,
                'pedagogical_reports',
                'create',
                '{}',
                '{}',
                json_build_object('school_id', '$CURRENT_USER.school_id'),
                'class_id,created_by_teacher_id,finalized_at,generated_at,generation_context,language,model_name,model_version,narrative,period_end,period_start,reviewed_at,school_id,status,structured_content,student_id,title,version'
            );
        END IF;
    END IF;
END $$;

