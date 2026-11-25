/**
 * Link the question-option ownership anchor after Directus creates users.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'question_options_creator_user_fk'
      ) THEN
        ALTER TABLE public.question_options
          ADD CONSTRAINT question_options_creator_user_fk
          FOREIGN KEY (created_by_user_id)
          REFERENCES public.directus_users (id)
          ON UPDATE CASCADE ON DELETE RESTRICT;
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
    ALTER TABLE IF EXISTS public.question_options
      DROP CONSTRAINT IF EXISTS question_options_creator_user_fk;
  `);
}
