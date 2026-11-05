import '../../bootstrap';
import { run, JobHelpers } from 'graphile-worker';
import dbConfig from '../../knexfile';
import { Task, MetadataBase } from '../../types';
import { getTaskName, addRebuildTokenJobs, getWorkerPreset } from '../../lib/utils';
import logger from '../../lib/logger';
import axios from 'axios';
import * as metadataDao from '../../lib/daos/metadata';
import * as tokensDao from '../../lib/daos/tokens';
import config from '../../lib/config';
import { triggerMetadataFetched } from '../../plugins/plugins';

require('dotenv').config();

interface FetchMetadataTaskPayload {
  metadata_uri: string;
}

async function downloadMetadata(url: string) {
  try {
    const { data } = await axios.get(url, {
      timeout: config.fetchMetadataTimeout,
      maxContentLength: config.metadataMaxFilesize,
    });

    return data;
  } catch (err) {
    // the job error only carries the message (e.g. a 504), not which url or gateway failed
    logger.warn(`failed to download metadata from ${url}: ${(err as Error).message}`);
    throw err;
  }
}

function getIpfsGateways() {
  return process.env.IPFS_GATEWAY?.split(',').map((ipfsGateway) => ipfsGateway.trim());
}

function normalizeGateway(ipfsGateway: string) {
  return ipfsGateway.trim().replace(/\/+$/, '');
}

// gateways that hold a complete archive: a 404 from one of them means the content is gone, so the
// remaining gateways are not tried. without this, lost content holds a worker for every gateway's
// timeout on every attempt.
function getIpfsArchiveGateways() {
  return (process.env.IPFS_ARCHIVE_GATEWAY || '').split(',').map(normalizeGateway).filter(Boolean);
}

function getOnchfsGateway() {
  return process.env.ONCHFS_GATEWAY ? process.env.ONCHFS_GATEWAY.trim() : null;
}

export async function downloadMetadataFromIpfs(ipfsCid: string, ipfsGateway: string) {
  return downloadMetadata(`${ipfsGateway}${ipfsGateway?.endsWith('/') ? '' : '/'}${ipfsCid}`);
}

export class MetadataNotFoundError extends Error {}

export async function downloadMetadataFromIpfsGateways(ipfsCid: string, ipfsGateways: Array<string>, archiveGateways: Array<string> = []) {
  if (!ipfsGateways.length) {
    throw new Error('missing ipfs gateways');
  }

  for (let i = 0; ; i++) {
    const ipfsGateway = ipfsGateways[i];

    try {
      return await downloadMetadataFromIpfs(ipfsCid, ipfsGateway);
    } catch (err) {
      if (archiveGateways.includes(normalizeGateway(ipfsGateway)) && (err as { response?: { status?: number } }).response?.status === 404) {
        throw new MetadataNotFoundError(`${ipfsCid} is not on archive gateway ${ipfsGateway}`);
      }

      if (i === ipfsGateways.length - 1) {
        throw err;
      }
    }
  }
}

// asks another teztok instance for metadata that no longer downloads. content that was only pinned on
// services that later dropped it often survives there, stored back when it still resolved.
export async function fetchMetadataFromFallback(metadataUri: string, endpoint = process.env.METADATA_FALLBACK_GRAPHQL) {
  if (!endpoint) {
    return null;
  }

  try {
    const { data } = await axios.post(
      endpoint,
      {
        query: `query ($uri: String!) { token_metadata(where: {uri: {_eq: $uri}, status: {_eq: "processed"}}) { data } }`,
        variables: { uri: metadataUri },
      },
      { timeout: config.fetchMetadataTimeout }
    );

    if (data.errors) {
      throw new Error(data.errors.map(({ message }: { message: string }) => message).join(', '));
    }

    return data.data?.token_metadata?.[0]?.data ?? null;
  } catch (err) {
    logger.warn(`failed to query the metadata fallback for ${metadataUri}: ${(err as Error).message}`);
    return null;
  }
}

export function validateMetadata(metadata: MetadataBase) {
  const metadataStr = JSON.stringify(metadata);
  const size = metadataStr.length;

  if (size > config.metadataMaxFilesize) {
    throw new Error(`metadata size of ${size} bytes exceeds maximum allowed size of ${config.metadataMaxFilesize} bytes.`);
  }
}

export async function processMetadata(payload: FetchMetadataTaskPayload, helpers?: JobHelpers) {
  let metadataUri = payload.metadata_uri;
  const ipfsGateways = getIpfsGateways();

  try {
    if (metadataUri.toLowerCase().startsWith('https://ipfs.io/ipfs/')) {
      metadataUri = metadataUri.replace('https://ipfs.io/ipfs/', 'ipfs://');
    }

    let metadataUriLowerCased = metadataUri.toLowerCase();
    let metadata;

    try {
      if (metadataUriLowerCased.startsWith('ipfs://')) {
        if (!ipfsGateways) {
          throw new Error('missing ipfs gateways');
        }

        metadata = await downloadMetadataFromIpfsGateways(metadataUri.substr(7), ipfsGateways, getIpfsArchiveGateways());
      } else if (metadataUriLowerCased.startsWith('onchfs://')) {
        const onchfsGateway = getOnchfsGateway();

        if (!onchfsGateway) {
          throw new Error('missing onchfs gateway');
        }

        const onchfsHash = metadataUri.substr(9);
        const metadataUrl = `${onchfsGateway}${onchfsGateway?.endsWith('/') ? '' : '/'}${onchfsHash}`;

        metadata = await downloadMetadata(metadataUrl);
      } else if (metadataUriLowerCased.startsWith('http://') || metadataUriLowerCased.startsWith('https://')) {
        // not lowercased: paths are case sensitive, and a lowercased cid points at nothing
        metadata = await downloadMetadata(metadataUri);
      } else {
        // unsupported format
        await metadataDao.update(metadataUri, 'error');
        logger.error(`unsupported metadata uri: ${metadataUri}`);
        return;
      }
    } catch (err) {
      const recovered = await fetchMetadataFromFallback(metadataUri);

      if (recovered === null) {
        if (err instanceof MetadataNotFoundError) {
          await metadataDao.update(metadataUri, 'error');
          logger.error(`metadata not found: ${err.message}`, { metadata_uri: metadataUri });
          return;
        }

        throw err;
      }

      logger.info(`recovered metadata from the fallback after the download failed: ${(err as Error).message}`, { metadata_uri: metadataUri });
      metadata = recovered;
    }

    try {
      validateMetadata(metadata);
    } catch (err) {
      await metadataDao.update(metadataUri, 'error'); // TODO: change to 'invalid_metadata'?
      logger.error(`invalid metadata, error: ${(err as Error).message}`, { metadata_uri: metadataUri });
      return;
    }

    await metadataDao.update(metadataUri, 'processed', metadata);

    await triggerMetadataFetched(metadataUri, metadata);

    const tokens = await tokensDao.getByField('metadata_uri', metadataUri);

    if (tokens && tokens.length) {
      await addRebuildTokenJobs(tokens);
    }
  } catch (err) {
    const errMessage = (err as Error).message;

    if (errMessage === 'The user aborted a request.' || errMessage === 'invalid metadata') {
      logger.error(`failed to fetch metadata: ${errMessage}`, { metadata_uri: metadataUri });
      await metadataDao.update(metadataUri, 'error');
      return;
    }

    if (helpers && helpers.job.max_attempts === helpers.job.attempts) {
      logger.error(`failed to fetch metadata, max attempts reached: ${errMessage}`, { metadata_uri: metadataUri });
      await metadataDao.update(metadataUri, 'error');
    }

    throw err;
  }
}

const task: Task = {
  name: 'fetch-metadata',

  spawnWorkers: async () => {
    await run({
      connectionString: dbConfig.connection,
      preset: getWorkerPreset(),
      concurrency: config.fetchMetadataConcurrency,
      noHandleSignals: false,
      pollInterval: config.workerPollInterval,
      taskList: {
        [getTaskName('fetch-metadata')]: async (payload, helpers) => {
          const p = payload as FetchMetadataTaskPayload;
          await processMetadata(p, helpers);
        },
      },
    });
  },
};

export default task;
