import uniqBy from 'lodash/uniqBy';
import get from 'lodash/get';
import isString from 'lodash/isString';
import { Processor, MetadataEvent } from '../../../types';
import { getWorkerUtils, getTaskName, sortedUniqueJobSpecs } from '../../../lib/utils';
import * as metadataDao from '../../../lib/daos/metadata';

// graphile-worker waits exp(attempt) seconds before each retry. 10 attempts spread the retries over
// about 3.5 hours, 6 over only 4 minutes: freshly minted content that only a slow gateway has (pinata,
// before it is pinned anywhere else) would otherwise fail for good during a few slow minutes. content
// that is gone everywhere still fails at once, because all gateways answering 404 is final.
export const FETCH_METADATA_MAX_ATTEMPTS = 10;

const MetadataProcessor: Processor = {
  accept: (event) => isString(get(event, 'metadata_uri')),

  exec: async (events) => {
    const uniqEvents: Array<MetadataEvent> = uniqBy(events, (event) => (event as MetadataEvent).metadata_uri) as Array<MetadataEvent>;
    const notExistingUris = await metadataDao.getNotExistingUris(uniqEvents.map(({ metadata_uri }) => metadata_uri));
    const workerUtils = await getWorkerUtils();

    const rows = notExistingUris.map((uri) => {
      const row: metadataDao.MetadataRow = {
        uri: uri,
        status: 'unprocessed',
        data: null,
      };

      return row;
    });

    if (rows.length) {
      await metadataDao.add(rows);

      // one addJobs call per level instead of one addJob per uri
      await workerUtils.addJobs(
        sortedUniqueJobSpecs(
          notExistingUris.map((uri) => ({
            identifier: getTaskName('fetch-metadata'),
            payload: { metadata_uri: uri },
            jobKey: `resolve-metadata-${uri.substring(0, 400)}`,
            maxAttempts: FETCH_METADATA_MAX_ATTEMPTS,
          }))
        )
      );
    }
  },
};

export default MetadataProcessor;
