import { Knex } from 'knex';

// last_level() used to return the newest event-producer job from graphile_worker.jobs. Since
// graphile-worker 0.13 that is a view without the payload, and a function returning its row type
// blocks graphile's own migrations. ctrl now records the indexed level in indexer_state, and
// last_level() keeps returning the same { id, payload: { filters: { level } } } shape from there.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS public.last_level();`);

  await knex.raw(`
    CREATE TABLE indexer_state (
      id smallint PRIMARY KEY CHECK (id = 1),
      level integer NOT NULL,
      updated_at timestamp with time zone NOT NULL DEFAULT now()
    );
  `);

  await knex.raw(`
    CREATE VIEW indexer_level AS
      SELECT id::bigint AS id, json_build_object('filters', json_build_object('level', level)) AS payload
      FROM indexer_state;
  `);

  await knex.raw(`
    CREATE FUNCTION public.last_level() RETURNS SETOF indexer_level
    LANGUAGE sql STABLE AS $$
      SELECT * FROM indexer_level;
    $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP FUNCTION IF EXISTS public.last_level();`);
  await knex.raw(`DROP VIEW IF EXISTS indexer_level;`);
  await knex.raw(`DROP TABLE IF EXISTS indexer_state;`);
}
