import get from 'lodash/get';
import isString from 'lodash/isString';
import { Processor, TokenEvent } from '../../../types';
import { addRebuildTokenJobs } from '../../../lib/utils';

const TokenProcessor: Processor = {
  accept: (event) => isString(get(event, 'fa2_address')) && isString(get(event, 'token_id')),

  exec: async (events) => {
    await addRebuildTokenJobs(events as Array<TokenEvent>);
  },
};

export default TokenProcessor;
