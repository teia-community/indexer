import got from 'got';
import { makeWorkerUtils, WorkerUtils } from 'graphile-worker';
import uniqBy from 'lodash/uniqBy';
import sortBy from 'lodash/sortBy';
import get from 'lodash/get';
import { metrohash128 } from 'metrohash';
import dbConfig from '../knexfile';
import db from './db';
import { Knex } from 'knex';
import config from './config';
import {
  RoyaltyShares,
  BigmapDiffs,
  BigmapDiff,
  BigmapDiffAction,
  KeysEnum,
  Pattern,
  Transactions,
  Transaction,
  GetTransactionsFilters,
  Origination,
  Originations,
  GetOriginationsFilters,
} from '../types';
import { CURRENCY_MAPPINGS } from '../consts';
import isIPFS from 'is-ipfs';

require('dotenv').config();

export async function getLatestBlockLevel() {
  const count = await got(`${config.tzktApiUrl}/blocks/count`).json<number>();

  return count - 1;
}

let workerUtilsPromise: Promise<WorkerUtils> | null = null;

export async function getWorkerUtils() {
  if (workerUtilsPromise === null) {
    workerUtilsPromise = makeWorkerUtils({
      connectionString: dbConfig.connection,
    });
  }

  return await workerUtilsPromise;
}

const ignoredContractAddresses = new Set(config.ignoredContractAddresses);

// whether events for tokens of this contract are kept: only the allowed contracts when
// ALLOWED_FA2_CONTRACT_ADDRESS is set, otherwise every contract that is not ignored
export function isIndexedContract(fa2Address: string) {
  if (config.allowedContractAddresses) {
    return config.allowedContractAddresses.includes(fa2Address);
  }

  return !ignoredContractAddresses.has(fa2Address);
}

// serializes everything that rebuilds one token. it is held until the transaction ends, so two jobs
// for the same token cannot read, delete and insert its rows at the same time: they used to collide
// on primary keys or deadlock, and then the job was dropped.
export async function lockToken(trx: Knex.Transaction, fa2Address: string, tokenId: string) {
  await trx.raw('select pg_advisory_xact_lock(hashtextextended(?, 0))', [`token:${fa2Address}:${tokenId}`]);
}

// shared graphile-worker settings for the worker processes' run() calls
export function getWorkerPreset(): GraphileConfig.Preset {
  return { worker: { localQueue: { size: config.workerLocalQueueSize } } };
}

// addJobs locks every existing job it replaces, in the order given. Concurrent calls that share keys
// deadlock unless they all lock in the same order, so sort by key. It also rejects repeated keys.
export function sortedUniqueJobSpecs<T extends { jobKey?: string }>(specs: Array<T>): Array<T> {
  return sortBy(uniqBy(specs, 'jobKey'), 'jobKey');
}

// one addJobs call instead of one addJob per token: every call commits with a NOTIFY, and those all
// serialize on postgres's global notify lock, so adding jobs one by one is slow under load.
export async function addRebuildTokenJobs(tokens: Array<{ fa2_address: string; token_id: string }>) {
  const specs = sortedUniqueJobSpecs(
    tokens.map(({ fa2_address, token_id }) => ({
      identifier: getTaskName('rebuild'),
      payload: { type: 'token', fa2_address, token_id },
      jobKey: `rebuild-token-${fa2_address}-${token_id}`,
      maxAttempts: 2,
    }))
  );

  if (!specs.length) {
    return;
  }

  // a rebuild job that has not started yet will read the token's events when it runs, including the
  // ones committed before this call, so re-adding it changes nothing. it would only lock the job row,
  // and concurrent workers adding the same popular tokens then wait on and deadlock over those locks.
  const { rows: waiting } = await db.raw(
    `select key from graphile_worker.jobs where key = any(?) and locked_at is null and attempts < max_attempts`,
    [specs.map(({ jobKey }) => jobKey)]
  );
  const waitingKeys = new Set(waiting.map(({ key }: { key: string }) => key));
  const newSpecs = specs.filter(({ jobKey }) => !waitingKeys.has(jobKey));

  if (!newSpecs.length) {
    return;
  }

  const workerUtils = await getWorkerUtils();

  // add_jobs locks rows in two passes (running jobs first, then the rest), so sorting cannot rule
  // deadlocks out entirely when calls overlap; postgres aborts one side, which can simply retry
  for (let attempt = 1; ; attempt++) {
    try {
      await workerUtils.addJobs(newSpecs);
      return;
    } catch (err) {
      if ((err as { code?: string }).code !== '40P01' || attempt >= 3) {
        throw err;
      }
    }
  }
}

function isMatchingDiff(
  diff: BigmapDiff,
  bigmapId: number | null,
  path: string,
  action: BigmapDiffAction | Array<BigmapDiffAction>,
  key?: string
) {
  const actions = Array.isArray(action) ? action : [action];

  return (
    (bigmapId === null || diff.bigmap === bigmapId) &&
    diff.path === path &&
    actions.includes(diff.action) &&
    (key ? diff.content.key === key : true)
  );
}

export function findDiff(
  diffs: BigmapDiffs,
  bigmapId: number | null,
  path: string,
  action: BigmapDiffAction | Array<BigmapDiffAction>,
  key?: string
) {
  return diffs.find((diff) => isMatchingDiff(diff, bigmapId, path, action, key));
}

export function filterDiffs(
  diffs: BigmapDiffs,
  bigmapId: number | null,
  path: string,
  action: BigmapDiffAction | Array<BigmapDiffAction>,
  key?: string
) {
  return diffs.filter((diff) => isMatchingDiff(diff, bigmapId, path, action, key));
}

const PATTERN_TO_PATH: KeysEnum<Pattern> = {
  entrypoint: 'parameter.entrypoint',
  target_address: 'target.address',
};

export function transactionMatchesPattern(transaction: Transaction, pattern: Pattern) {
  return Object.entries(pattern).every(([key, val]) => get(transaction, PATTERN_TO_PATH[key as keyof Pattern]) === val);
}

export function createEventId(handlerName: string, transaction: Transaction | Origination, idx: number = 0) {
  if (!('hash' in transaction && 'counter' in transaction && 'nonce' in transaction)) {
    throw new Error('transaction does not have all the properties needed (counter, hash and nonce) to create an eventId.');
  }

  return metrohash128(
    `${handlerName}:${transaction.hash}:${transaction.counter}:${transaction.nonce !== null ? transaction.nonce : 'unset'}:${idx}`
  );
}

export async function getBlockQuotes(level: number, currencies: Array<string>) {
  const result = await got(`${config.tzktApiUrl}/blocks/${level}`, {
    searchParams: {
      quote: currencies.join(','),
    },
  }).json<{ quote: Record<string, number> }>();

  return result.quote;
}

export async function getTransactions(
  filters: GetTransactionsFilters,
  perPage: number = 2000,
  maxPages: number = 20,
  select = 'id,level,timestamp,block,hash,counter,nonce,sender,target,amount,parameter,status,hasInternals,initiator,storage,diffs'
) {
  const allTransactions: Transactions = [];
  let currentPage = 0;

  do {
    const transactions = await got(`${config.tzktApiUrl}/operations/transactions`, {
      searchParams: {
        ...filters,
        offset: currentPage * perPage,
        limit: perPage,
        status: 'applied',
        select,
      },
    }).json<Transactions>();

    allTransactions.push(...transactions);

    if (transactions.length < perPage) {
      break;
    }

    currentPage++;
  } while (currentPage < maxPages);

  return uniqBy(allTransactions, 'id');
}

export async function getOriginations(filters: GetOriginationsFilters, perPage: number = 2000, maxPages: number = 20) {
  const allOriginations: Originations = [];
  let currentPage = 0;

  do {
    const originations = await got(`${config.tzktApiUrl}/operations/originations`, {
      searchParams: {
        ...filters,
        offset: currentPage * perPage,
        limit: perPage,
        status: 'applied',
        select: 'id,nonce,level,timestamp,block,counter,hash,initiator,sender,status,storage,originatedContract',
      },
    }).json<Originations>();

    allOriginations.push(...originations);

    if (originations.length < perPage) {
      break;
    }

    currentPage++;
  } while (currentPage < maxPages);

  return uniqBy(allOriginations, 'id');
}

type ObjktCurrencyTez = { tez: {} };
type ObjktCurrencyFa12 = { fa12: string };
type ObjktCurrency = ObjktCurrencyTez | ObjktCurrencyFa12;

export function extractObjktCurrency(currency: ObjktCurrency) {
  if ('tez' in currency) {
    return 'tez';
  }

  if ('fa12' in currency) {
    if (CURRENCY_MAPPINGS[currency['fa12']]) {
      return CURRENCY_MAPPINGS[currency['fa12']];
    }

    return currency['fa12'];
  }

  return null;
}

export function getTaskName(name: string) {
  const taskNamePrefix = process.env.TASK_NAME_PREFIX;

  if (taskNamePrefix) {
    return `${taskNamePrefix}_${name}`;
  }

  return name;
}

export function isTezLikeCurrency(currency: unknown) {
  if (!currency) {
    return true;
  }

  return currency === 'tez' || currency === 'otez';
}

export function isTezLikeCurrencyStrict(currency: unknown) {
  return currency === 'tez' || currency === 'otez';
}

export function splitsToRoyaltyShares(splits: Array<{ pct: string; address: string }>, totalRoyalties: string): RoyaltyShares {
  const totalRoyaltiesInt = parseInt(totalRoyalties, 10);

  const shares = splits.reduce<Record<string, string>>((memo, split) => {
    const pct = parseInt(split.pct, 10);

    memo[split.address] = String(totalRoyaltiesInt * pct);

    return memo;
  }, {});

  return {
    decimals: 6,
    shares,
  };
}

export function royaltiesToRoyaltyShares(receiverAddress: string, totalRoyalties: string, decimals: number = 3): RoyaltyShares {
  return {
    decimals,
    shares: {
      [receiverAddress]: totalRoyalties,
    },
  };
}

// token_info values are usually raw bytes, but some contracts store a michelson PACKed string instead:
// 0x05 0x01, a 4-byte big-endian length, then the string. decoded as raw bytes, that prefix ends up in
// front of the uri and breaks it.
export function decodeTokenInfoBytes(hex: string) {
  const bytes = Buffer.from(hex, 'hex');

  if (bytes.length >= 6 && bytes[0] === 0x05 && bytes[1] === 0x01 && bytes.readUInt32BE(2) === bytes.length - 6) {
    return bytes.subarray(6).toString();
  }

  return bytes.toString();
}

export function normalizeMetadataIpfsUri(metadataUri: string) {
  let newMetadataUri = metadataUri;

  if (!metadataUri.toLowerCase().startsWith('ipfs://') && isIPFS.cid(metadataUri)) {
    newMetadataUri = `ipfs://${metadataUri}`;
  }

  if (metadataUri.startsWith('ipfs://ipfs/')) {
    // sometimes the case for rarible tokens
    newMetadataUri = newMetadataUri.replace('ipfs://ipfs/', 'ipfs://');
  }

  return newMetadataUri;
}
