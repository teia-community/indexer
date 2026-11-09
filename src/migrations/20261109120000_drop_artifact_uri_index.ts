import { Knex } from 'knex';

// The setup migration no longer creates an index on tokens.artifact_uri, but databases created before that
// change still have it. Nothing filters on artifact_uri, and a btree entry over ~2704 bytes is rejected,
// which fails the whole token update and leaves tokens with a long uri permanently unrebuildable.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS tokens_artifact_uri_index;`);
}

// Deliberately not recreated: the index served no query and only caused failed rebuilds.
export async function down(knex: Knex): Promise<void> {}
