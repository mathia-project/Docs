/**
 * Link the question ownership anchor after Directus has created its users table.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'question_bank_items_creator_user_fk'
      ) THEN
        ALTER TABLE public.question_bank_items
          ADD CONSTRAINT question_bank_items_creator_user_fk
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
    ALTER TABLE IF EXISTS public.question_bank_items
      DROP CONSTRAINT IF EXISTS question_bank_items_creator_user_fk;
  `);
}
