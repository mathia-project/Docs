/**
 * Link application-owned records to Directus-owned authentication and file
 * records. The application schema is installed by PostgreSQL before Directus
 * bootstraps its system tables, so these three constraints belong here.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'student_profiles_directus_user_fk'
      ) THEN
        ALTER TABLE public.student_profiles
          ADD CONSTRAINT student_profiles_directus_user_fk
          FOREIGN KEY (directus_user_id)
          REFERENCES public.directus_users (id)
          ON UPDATE CASCADE ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'teacher_profiles_directus_user_fk'
      ) THEN
        ALTER TABLE public.teacher_profiles
          ADD CONSTRAINT teacher_profiles_directus_user_fk
          FOREIGN KEY (directus_user_id)
          REFERENCES public.directus_users (id)
          ON UPDATE CASCADE ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'resources_directus_file_fk'
      ) THEN
        ALTER TABLE public.resources
          ADD CONSTRAINT resources_directus_file_fk
          FOREIGN KEY (directus_file_id)
          REFERENCES public.directus_files (id)
          ON UPDATE CASCADE ON DELETE SET NULL;
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
    ALTER TABLE IF EXISTS public.student_profiles
      DROP CONSTRAINT IF EXISTS student_profiles_directus_user_fk;
    ALTER TABLE IF EXISTS public.teacher_profiles
      DROP CONSTRAINT IF EXISTS teacher_profiles_directus_user_fk;
    ALTER TABLE IF EXISTS public.resources
      DROP CONSTRAINT IF EXISTS resources_directus_file_fk;
  `);
}

