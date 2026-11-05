import './bootstrap';
import { HubConnectionBuilder } from '@microsoft/signalr';
import uniqBy from 'lodash/uniqBy';
import config from './lib/config';
import * as eventsDao from './lib/daos/events';
import { getWorkerUtils } from './lib/utils';
import { rebuild } from './tasks/rebuild/rebuild';
import logger from './lib/logger';
import db from './lib/db';
import { getTaskName } from './lib/utils';
import { TokenEvent } from './types';

let isRebuildingTokens = false;
const tokensWithErrors: Record<string, boolean> = {};

// TODO: solve this properly
async function rebuildOutstandingTokens(max = 200) {
  isRebuildingTokens = true;

  try {
    const results = (
      await db
        .select('*')
        .from('graphile_worker.jobs')
        .where('task_identifier', getTaskName('rebuild'))
        .andWhere('attempts', '=', 0)
        .orderBy('id', 'desc')
        .limit(max)
    ).filter(({ payload }) => payload.type === 'token');

    const startedAt = Date.now();
    let rebuilt = 0;
    let skipped = 0;
    let failed = 0;

    for (const result of results) {
      const tokenKey = `${result.payload.fa2_address}_${result.payload.token_id}`;

      try {
        if (tokensWithErrors[tokenKey]) {
          // skip tokens that threw an error while rebuilding before
          skipped++;
          continue;
        }

        await rebuild!(result.payload);
        await db('graphile_worker.jobs').where('id', result.id).del();
        rebuilt++;
      } catch (err) {
        tokensWithErrors[tokenKey] = true;
        failed++;
        console.log(`failed to rebuild token ${tokenKey}`, err);
      }
    }

    if (results.length) {
      console.log(`rebuilt ${rebuilt} outstanding tokens in ${Date.now() - startedAt}ms (skipped: ${skipped}, failed: ${failed})`);
    }
  } catch (err) {
    console.log('failed to rebuild tokens', err);
  }

  isRebuildingTokens = false;
}

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

    const tokens = uniqBy([...offerResults, ...listingResults], ({ fa2_address, token_id }) => `${fa2_address}-${token_id}`) as Array<{
      fa2_address: string;
      token_id: string;
    }>;

    const workerUtils = await getWorkerUtils();

    for (const token of tokens) {
      await workerUtils.addJob(
        getTaskName('rebuild'),
        { type: 'token', fa2_address: token.fa2_address, token_id: token.token_id },
        { jobKey: `rebuild-token-${token.fa2_address}-${token.token_id}`, maxAttempts: 2 }
      );
    }
  } catch (err) {
    console.log('failed to handle timed out offers and listings', err);
  }
}

let isEnqueueingLevels = false;

async function countPendingLevels() {
  const [{ count }] = await db('graphile_worker.jobs')
    .where('task_identifier', getTaskName('event-producer'))
    .andWhereRaw('attempts < max_attempts')
    .count('* as count');

  return parseInt(count as string, 10);
}

// one statement instead of one addJob per level: every add_job commit sends a NOTIFY, and those all
// serialize on postgres's global notify lock, so enqueueing level by level is slow under load.
async function enqueueLevels(from: number, to: number) {
  await db.raw(
    `select graphile_worker.add_job(
       identifier => ?,
       payload => json_build_object('filters', json_build_object('level', level)),
       job_key => 'index-level-' || level
     )
     from generate_series(?::int, ?::int) as level`,
    [getTaskName('event-producer'), from, to]
  );
}

export async function run() {
  const connection = new HubConnectionBuilder().withUrl(`${config.tzktApiUrl}/ws`).build();
  const workerUtils = await getWorkerUtils();
  let lastBlock = (await eventsDao.getLatestLevel()) || config.startBlock - 1;

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
        // backpressure: only top the queue up, so it cannot run far ahead of the workers
        const room = Math.max(0, config.maxPendingLevels - (await countPendingLevels()));
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
      const uniqInvalidTokenEvents: Array<TokenEvent> = uniqBy(invalidEvents, (event) => `${event.fa2_address}-${event.token_id}`);
      await db('events').where('level', '>', lastValidBlock).del();

      // TODO: handle case of other data models than tokens
      for (const event of uniqInvalidTokenEvents) {
        await workerUtils.addJob(
          getTaskName('rebuild'),
          { type: 'token', fa2_address: event.fa2_address, token_id: event.token_id },
          { jobKey: `rebuild-token-${event.fa2_address}-${event.token_id}`, maxAttempts: 2 }
        );
      }

      // rewind so the reverted levels get re-indexed
      lastBlock = Math.min(lastBlock, lastValidBlock);
    }

    if (!isRebuildingTokens) {
      // temp workaround to the problem that indexer is sometimes lagging...
      rebuildOutstandingTokens(200);
    }
  });

  init();
}

run();
