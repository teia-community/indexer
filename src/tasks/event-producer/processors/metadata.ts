import uniqBy from 'lodash/uniqBy';
import get from 'lodash/get';
import isString from 'lodash/isString';
import { Processor, MetadataEvent } from '../../../types';
import { getWorkerUtils, getTaskName, sortedUniqueJobSpecs } from '../../../lib/utils';
import * as metadataDao from '../../../lib/daos/metadata';

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
            maxAttempts: 6,
          }))
        )
      );
    }
  },
};

export default MetadataProcessor;
