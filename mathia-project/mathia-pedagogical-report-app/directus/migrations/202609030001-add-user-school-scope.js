/**
 * Give Directus' permission engine a scalar tenant anchor on the authenticated
 * user. Profile tables remain the pedagogical records; this column exists so
 * create validations and presets can use $CURRENT_USER.school_id safely.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw(`
    ALTER TABLE public.directus_users
      ADD COLUMN IF NOT EXISTS school_id uuid;

    DO $$
    BEGIN
      IF EXISTS (
        SELECT membership.directus_user_id
        FROM (
          SELECT directus_user_id, school_id
          FROM public.teacher_profiles
          WHERE directus_user_id IS NOT NULL
          UNION ALL
          SELECT directus_user_id, school_id
          FROM public.student_profiles
          WHERE directus_user_id IS NOT NULL
        ) AS membership
        GROUP BY membership.directus_user_id
        HAVING count(DISTINCT membership.school_id) > 1
      ) THEN
        RAISE EXCEPTION
          'A Directus user is linked to profiles in more than one school';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.directus_users AS app_user
        JOIN (
          SELECT directus_user_id, (array_agg(school_id))[1] AS school_id
          FROM (
            SELECT directus_user_id, school_id
            FROM public.teacher_profiles
            WHERE directus_user_id IS NOT NULL
            UNION ALL
            SELECT directus_user_id, school_id
            FROM public.student_profiles
            WHERE directus_user_id IS NOT NULL
          ) AS membership_rows
          GROUP BY directus_user_id
        ) AS membership ON membership.directus_user_id = app_user.id
        WHERE app_user.school_id IS NOT NULL
          AND app_user.school_id <> membership.school_id
      ) THEN
        RAISE EXCEPTION
          'A Directus user school conflicts with its existing profile';
      END IF;
    END
    $$;

    WITH membership AS (
      SELECT directus_user_id, (array_agg(school_id))[1] AS school_id
      FROM (
        SELECT directus_user_id, school_id
        FROM public.teacher_profiles
        WHERE directus_user_id IS NOT NULL
        UNION ALL
        SELECT directus_user_id, school_id
        FROM public.student_profiles
        WHERE directus_user_id IS NOT NULL
      ) AS membership_rows
      GROUP BY directus_user_id
    )
    UPDATE public.directus_users AS app_user
    SET school_id = membership.school_id
    FROM membership
    WHERE app_user.id = membership.directus_user_id
      AND app_user.school_id IS NULL;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'directus_users_school_fk'
          AND conrelid = 'public.directus_users'::regclass
      ) THEN
        ALTER TABLE public.directus_users
          ADD CONSTRAINT directus_users_school_fk
          FOREIGN KEY (school_id)
          REFERENCES public.schools (id)
          ON UPDATE CASCADE ON DELETE RESTRICT;
      END IF;
    END
    $$;

    CREATE INDEX IF NOT EXISTS directus_users_school_idx
      ON public.directus_users (school_id)
      WHERE school_id IS NOT NULL;

    CREATE OR REPLACE FUNCTION public.mathia_validate_profile_user_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      linked_school_id uuid;
      linked_role_name text;
    BEGIN
      IF NEW.directus_user_id IS NULL THEN
        RETURN NEW;
      END IF;

      SELECT app_user.school_id, app_role.name
      INTO linked_school_id, linked_role_name
      FROM public.directus_users AS app_user
      LEFT JOIN public.directus_roles AS app_role ON app_role.id = app_user.role
      WHERE app_user.id = NEW.directus_user_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'The linked Directus user does not exist'
          USING ERRCODE = '23503';
      END IF;

      IF linked_school_id IS NULL OR linked_school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'The profile and Directus user must belong to the same school'
          USING ERRCODE = '23514';
      END IF;

      IF TG_TABLE_NAME = 'teacher_profiles'
        AND linked_role_name NOT IN ('Teacher', 'Director') THEN
        RAISE EXCEPTION 'A teacher profile requires a Teacher or Director user'
          USING ERRCODE = '23514';
      END IF;

      IF TG_TABLE_NAME = 'student_profiles'
        AND linked_role_name <> 'Student' THEN
        RAISE EXCEPTION 'A student profile requires a Student user'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END
    $$;

    DROP TRIGGER IF EXISTS teacher_profiles_user_scope_guard
      ON public.teacher_profiles;
    CREATE TRIGGER teacher_profiles_user_scope_guard
      BEFORE INSERT OR UPDATE OF directus_user_id, school_id
      ON public.teacher_profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.mathia_validate_profile_user_scope();

    DROP TRIGGER IF EXISTS student_profiles_user_scope_guard
      ON public.student_profiles;
    CREATE TRIGGER student_profiles_user_scope_guard
      BEFORE INSERT OR UPDATE OF directus_user_id, school_id
      ON public.student_profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.mathia_validate_profile_user_scope();

    CREATE OR REPLACE FUNCTION public.mathia_validate_app_user_scope()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      linked_role_name text;
    BEGIN
      SELECT name INTO linked_role_name
      FROM public.directus_roles
      WHERE id = NEW.role;

      IF linked_role_name IN ('Student', 'Teacher', 'Director')
        AND NEW.school_id IS NULL THEN
        RAISE EXCEPTION 'Mathia application users require a school'
          USING ERRCODE = '23514';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.teacher_profiles
        WHERE directus_user_id = NEW.id
          AND (
            school_id <> NEW.school_id
            OR linked_role_name NOT IN ('Teacher', 'Director')
          )
      ) THEN
        RAISE EXCEPTION 'The user conflicts with its teacher profile'
          USING ERRCODE = '23514';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.student_profiles
        WHERE directus_user_id = NEW.id
          AND (
            school_id <> NEW.school_id
            OR linked_role_name <> 'Student'
          )
      ) THEN
        RAISE EXCEPTION 'The user conflicts with its student profile'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END
    $$;

    DROP TRIGGER IF EXISTS directus_users_school_scope_guard
      ON public.directus_users;
    CREATE TRIGGER directus_users_school_scope_guard
      BEFORE INSERT OR UPDATE OF role, school_id
      ON public.directus_users
      FOR EACH ROW
      EXECUTE FUNCTION public.mathia_validate_app_user_scope();

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM public.directus_users AS app_user
        JOIN public.directus_roles AS app_role ON app_role.id = app_user.role
        WHERE app_role.name IN ('Student', 'Teacher', 'Director')
          AND app_user.school_id IS NULL
      ) THEN
        RAISE EXCEPTION
          'Existing Mathia application users must be linked to a school before migration';
      END IF;
    END
    $$;
  `);
}

/**
 * @param {import('knex').Knex} knex
 */
export async function down(knex) {
  await knex.raw(`
    DROP TRIGGER IF EXISTS directus_users_school_scope_guard
      ON public.directus_users;
    DROP TRIGGER IF EXISTS student_profiles_user_scope_guard
      ON public.student_profiles;
    DROP TRIGGER IF EXISTS teacher_profiles_user_scope_guard
      ON public.teacher_profiles;

    DROP FUNCTION IF EXISTS public.mathia_validate_app_user_scope();
    DROP FUNCTION IF EXISTS public.mathia_validate_profile_user_scope();

    DROP INDEX IF EXISTS public.directus_users_school_idx;
    ALTER TABLE public.directus_users
      DROP CONSTRAINT IF EXISTS directus_users_school_fk;
    ALTER TABLE public.directus_users
      DROP COLUMN IF EXISTS school_id;
  `);
}
