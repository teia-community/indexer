import './bootstrap';
import { HubConnectionBuilder } from '@microsoft/signalr';
import config from './lib/config';
import * as eventsDao from './lib/daos/events';
import { getWorkerUtils, addRebuildTokenJobs } from './lib/utils';
import logger from './lib/logger';
import db from './lib/db';
import { getTaskName } from './lib/utils';
import { TokenEvent } from './types';

async function handleTimedoutOffersAndListings(max = 50) {
  try {
    const offerResults = await db
      .select('fa2_address', 'token_id')
      .from('offers')
      .whereIn('type', ['OBJKT_OFFER', 'OBJKT_OFFER_V3_PRE', 'OBJKT_OFFER_V3'])
      .whereNotNull('end_time')
      .where('end_time', '<', new Date())
      .where('status', '=', 'active')
      .orderBy('end_time', 'desc')
      .limit(max);

    const listingResults = await db
      .select('fa2_address', 'token_id')
      .from('listings')
      .whereIn('type', ['OBJKT_ASK_V3_PRE', 'OBJKT_ASK_V3'])
      .whereNotNull('end_time')
      .where('end_time', '<', new Date())
      .where('status', '=', 'active')
      .orderBy('end_time', 'desc')
      .limit(max);

    await addRebuildTokenJobs([...offerResults, ...listingResults]);
  } catch (err) {
    console.log('failed to handle timed out offers and listings', err);
  }
}

let isEnqueueingLevels = false;

// the level keys tell which levels are still waiting; the jobs view has no payload since graphile-worker 0.13
async function getPendingLevels() {
  const {
    rows: [{ count, lowest, highest }],
  } = await db.raw(
    `select count(*)::int as count, min(substring(key from 13)::int) as lowest, max(substring(key from 13)::int) as highest
     from graphile_worker.jobs
     where task_identifier = ? and attempts < max_attempts and key like 'index-level-%'`,
    [getTaskName('event-producer')]
  );

  return { count: count as number, lowest: lowest as number | null, highest: highest as number | null };
}

// one addJobs call instead of one addJob per level: every call commits with a NOTIFY, and those all
// serialize on postgres's global notify lock, so enqueueing level by level is slow under load.
async function enqueueLevels(from: number, to: number) {
  const workerUtils = await getWorkerUtils();

  await workerUtils.addJobs(
    Array.from({ length: to - from + 1 }, (_, i) => ({
      identifier: getTaskName('event-producer'),
      payload: { filters: { level: from + i } },
      jobKey: `index-level-${from + i}`,
    }))
  );
}

// read through the last_level() function, which the status bot polls via hasura. failing to record it
// must not stop indexing, so errors are only logged.
async function recordIndexedLevel(level: number) {
  try {
    await db('indexer_state').insert({ id: 1, level, updated_at: new Date() }).onConflict('id').merge();
  } catch (err) {
    logger.error(`failed to record indexed level ${level}`, err);
  }
}

export async function run() {
  const connection = new HubConnectionBuilder().withUrl(`${config.tzktApiUrl}/ws`).build();
  const workerUtils = await getWorkerUtils();
  // continue after the levels still queued from before a restart; re-adding a level that a worker is
  // running makes graphile queue a second copy, and both copies then run at the same time
  let lastBlock = Math.max((await eventsDao.getLatestLevel()) || config.startBlock - 1, (await getPendingLevels()).highest || 0);

  async function init() {
    await connection.start();
    await connection.invoke('SubscribeToHead');
  }

  connection.onclose(init);

  connection.on('head', async (msg) => {
    if (msg.type === 1) {
      // head messages keep arriving while a previous handler is still awaiting. without this guard
      // the next one starts from the same lastBlock and enqueues the same levels a second time.
      if (isEnqueueingLevels) {
        return;
      }

      isEnqueueingLevels = true;
      const startBlock = lastBlock + 1;

      try {
        const pending = await getPendingLevels();

        // everything below the lowest waiting level is done; with nothing waiting, all enqueued levels are
        await recordIndexedLevel(pending.lowest !== null ? pending.lowest - 1 : lastBlock);

        // backpressure: only top the queue up, so it cannot run far ahead of the workers
        const room = Math.max(0, config.maxPendingLevels - pending.count);
        const max = Math.min(lastBlock + Math.min(config.maxBlocksPerIteration, room), msg.state);

        if (max >= startBlock) {
          // claim the range before awaiting, so a reorg handled meanwhile can still rewind it
          lastBlock = max;
          await enqueueLevels(startBlock, max);

          // TODO: sometimes some transactions get missed in the first run. this is a temporariy workaround.
          await workerUtils.addJob(getTaskName('event-producer'), { filters: { level: max - 5 } }, { jobKey: `index-level-${max - 5}` });

          // every 10 blocks, check for timed out offers and listings
          if (Math.floor(max / 10) > Math.floor((startBlock - 1) / 10)) {
            await handleTimedoutOffersAndListings();
          }
        }
      } catch (err) {
        logger.error(`failed to enqueue levels from ${startBlock}`, err);
        // hand the range back so the next head message retries it
        lastBlock = Math.min(lastBlock, startBlock - 1);
      } finally {
        isEnqueueingLevels = false;
      }
    } else if (msg.type === 2) {
      const lastValidBlock = msg.state;
      logger.info(`reorg: revert to level ${lastValidBlock}`);
      const invalidEvents = await db.select('*').from('events').where('level', '>', lastValidBlock);
      await db('events').where('level', '>', lastValidBlock).del();

      // TODO: handle case of other data models than tokens
      await addRebuildTokenJobs((invalidEvents as Array<TokenEvent>).filter(({ fa2_address, token_id }) => fa2_address && token_id));

      // rewind so the reverted levels get re-indexed
      lastBlock = Math.min(lastBlock, lastValidBlock);
    }
  });

  init();
}

run();
