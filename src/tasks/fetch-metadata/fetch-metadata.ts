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

function getOnchfsGateway() {
  return process.env.ONCHFS_GATEWAY ? process.env.ONCHFS_GATEWAY.trim() : null;
}

export async function downloadMetadataFromIpfs(ipfsCid: string, ipfsGateway: string) {
  return downloadMetadata(`${ipfsGateway}${ipfsGateway?.endsWith('/') ? '' : '/'}${ipfsCid}`);
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

    if (metadataUriLowerCased.startsWith('ipfs://')) {
      const ipfsHash = metadataUri.substr(7);

      if (!ipfsGateways) {
        throw new Error('missing ipfs gateways');
      }

      for (let i = 0; i < ipfsGateways?.length; i++) {
        const ipfsGateway = ipfsGateways[i];

        try {
          metadata = await downloadMetadataFromIpfs(ipfsHash, ipfsGateway);
          break;
        } catch (err) {
          if (i === ipfsGateways.length - 1) {
            throw err;
          }
        }
      }
    } else if (metadataUriLowerCased.startsWith('onchfs://')) {
      const onchfsGateway = getOnchfsGateway();

      if (!onchfsGateway) {
        throw new Error('missing onchfs gateway');
      }

      const onchfsHash = metadataUri.substr(9);
      const metadataUrl = `${onchfsGateway}${onchfsGateway?.endsWith('/') ? '' : '/'}${onchfsHash}`;

      metadata = await downloadMetadata(metadataUrl);
    } else if (metadataUriLowerCased.startsWith('http://') || metadataUriLowerCased.startsWith('https://')) {
      metadata = await downloadMetadata(metadataUriLowerCased);
    } else {
      // unsupported format
      await metadataDao.update(metadataUri, 'error');
      logger.error(`unsupported metadata uri: ${metadataUri}`);
      return;
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
