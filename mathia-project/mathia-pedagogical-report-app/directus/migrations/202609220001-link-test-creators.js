/**
 * Complete the Directus ownership links for test-related records.
 * The users table is created by Directus, so these constraints cannot live in
 * the PostgreSQL first-boot scripts.
 */
export async function up(knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'question_import_batches_creator_user_fk') THEN
        ALTER TABLE public.question_import_batches
          ADD CONSTRAINT question_import_batches_creator_user_fk
          FOREIGN KEY (created_by_user_id) REFERENCES public.directus_users(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tests_creator_user_fk') THEN
        ALTER TABLE public.tests
          ADD CONSTRAINT tests_creator_user_fk
          FOREIGN KEY (created_by_user_id) REFERENCES public.directus_users(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'test_versions_creator_user_fk') THEN
        ALTER TABLE public.test_versions
          ADD CONSTRAINT test_versions_creator_user_fk
          FOREIGN KEY (created_by_user_id) REFERENCES public.directus_users(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;
      END IF;
    END
    $$;
  `);
}

export async function down(knex) {
  await knex.raw(`
    ALTER TABLE IF EXISTS public.question_import_batches DROP CONSTRAINT IF EXISTS question_import_batches_creator_user_fk;
    ALTER TABLE IF EXISTS public.tests DROP CONSTRAINT IF EXISTS tests_creator_user_fk;
    ALTER TABLE IF EXISTS public.test_versions DROP CONSTRAINT IF EXISTS test_versions_creator_user_fk;
  `);
}
