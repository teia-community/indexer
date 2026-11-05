import '../bootstrap';
import path from 'path';
import db from '../lib/db';
import { getWorkerUtils } from '../lib/utils';

(async () => {
  try {
    // The old last_level() returned rows of graphile_worker.jobs, and graphile-worker cannot drop
    // that table while a function depends on its type. Drop it before graphile migrates; the
    // indexer_level migration recreates it without that dependency.
    await db.raw(`
      DO $$
      BEGIN
        IF to_regtype('graphile_worker.jobs') IS NOT NULL AND EXISTS (
          SELECT 1 FROM pg_proc
          WHERE oid = to_regprocedure('public.last_level()') AND prorettype = to_regtype('graphile_worker.jobs')
        ) THEN
          DROP FUNCTION public.last_level();
        END IF;
      END $$;
    `);

    // Installs or upgrades the graphile_worker schema. The setup migration creates a function
    // returning rows of graphile_worker.jobs, so it has to exist first.
    const workerUtils = await getWorkerUtils();
    await workerUtils.migrate();
    await workerUtils.release();

    await db.migrate.latest({ directory: path.join(__dirname, '../migrations') });
    await db.destroy();
  } catch (err) {
    console.log('failed to update database scheme', err);
    process.exitCode = 1;
  }
})();
