import axios from 'axios';
import {
  downloadMetadataFromIpfsGateways,
  fetchMetadataFromFallback,
  processMetadata,
  MetadataNotFoundError,
  MetadataTooLargeError,
} from './fetch-metadata';
import * as metadataDao from '../../lib/daos/metadata';
import * as tokensDao from '../../lib/daos/tokens';
import { addRebuildTokenJobs } from '../../lib/utils';
import { triggerMetadataFetched } from '../../plugins/plugins';

jest.mock('axios');
jest.mock('../../lib/daos/metadata');
jest.mock('../../lib/daos/tokens');
jest.mock('../../plugins/plugins');
jest.mock('../../lib/utils', () => ({ ...jest.requireActual('../../lib/utils'), addRebuildTokenJobs: jest.fn() }));

const mockedAxios = axios as jest.Mocked<typeof axios>;

function httpError(status: number) {
  return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });
}

function respondPerGateway(responses: Record<string, Error | object>) {
  mockedAxios.get.mockImplementation(async (url: string) => {
    const gateway = Object.keys(responses).find((prefix) => url.startsWith(prefix))!;
    const response = responses[gateway];

    if (response instanceof Error) {
      throw response;
    }

    return { data: response };
  });
}

beforeEach(() => {
  jest.resetAllMocks();
});

test('tries the next gateway when one fails', async () => {
  respondPerGateway({
    'https://a.example/ipfs': httpError(504),
    'https://b.example/ipfs': { name: 'token' },
  });

  await expect(downloadMetadataFromIpfsGateways('QmCid', ['https://a.example/ipfs', 'https://b.example/ipfs'])).resolves.toStrictEqual({
    name: 'token',
  });
});

test('a 404 does not stop the other gateways from being tried', async () => {
  respondPerGateway({
    'https://archive.example/ipfs': httpError(404),
    'https://upload.example/ipfs': httpError(404),
    'https://c.example/ipfs': { name: 'token' },
  });

  await expect(
    downloadMetadataFromIpfsGateways('QmCid', ['https://archive.example/ipfs', 'https://upload.example/ipfs/', 'https://c.example/ipfs'])
  ).resolves.toStrictEqual({ name: 'token' });
});

test('gives up for good only when every gateway answers 404', async () => {
  respondPerGateway({
    'https://a.example/ipfs': httpError(404),
    'https://b.example/ipfs': httpError(404),
  });

  await expect(downloadMetadataFromIpfsGateways('QmCid', ['https://a.example/ipfs', 'https://b.example/ipfs/'])).rejects.toThrow(
    new MetadataNotFoundError('QmCid is not on any gateway (404 from https://a.example/ipfs, https://b.example/ipfs)')
  );
});

test('a timeout or 5xx on any gateway leaves the failure to the retries', async () => {
  respondPerGateway({
    'https://a.example/ipfs': httpError(404),
    'https://b.example/ipfs': httpError(504),
  });

  const result = downloadMetadataFromIpfsGateways('QmCid', ['https://a.example/ipfs', 'https://b.example/ipfs']);

  await expect(result).rejects.toThrow('Request failed with status code 504');
  await expect(result).rejects.not.toBeInstanceOf(MetadataNotFoundError);
});

test('returns the metadata another instance stored', async () => {
  mockedAxios.post.mockResolvedValue({ data: { data: { token_metadata: [{ data: { name: 'token' } }] } } });

  await expect(fetchMetadataFromFallback('ipfs://QmCid', 'https://teztok.example/v1/graphql')).resolves.toStrictEqual({ name: 'token' });
  expect(mockedAxios.post).toHaveBeenCalledWith(
    'https://teztok.example/v1/graphql',
    expect.objectContaining({ variables: { uri: 'ipfs://QmCid' } }),
    expect.anything()
  );
});

test('the fallback returns null when it has nothing, fails, or is not configured', async () => {
  mockedAxios.post.mockResolvedValueOnce({ data: { data: { token_metadata: [] } } });
  await expect(fetchMetadataFromFallback('ipfs://QmCid', 'https://teztok.example/v1/graphql')).resolves.toBeNull();

  mockedAxios.post.mockResolvedValueOnce({ data: { errors: [{ message: 'field "token_metadata" not found' }] } });
  await expect(fetchMetadataFromFallback('ipfs://QmCid', 'https://teztok.example/v1/graphql')).resolves.toBeNull();

  mockedAxios.post.mockRejectedValueOnce(httpError(502));
  await expect(fetchMetadataFromFallback('ipfs://QmCid', 'https://teztok.example/v1/graphql')).resolves.toBeNull();

  await expect(fetchMetadataFromFallback('ipfs://QmCid', '')).resolves.toBeNull();
  expect(mockedAxios.post).toHaveBeenCalledTimes(3);
});

test('stops at metadata that exceeds the size limit, without trying other gateways', async () => {
  respondPerGateway({
    'https://a.example/ipfs': new Error('maxContentLength size of 61440 exceeded'),
    'https://b.example/ipfs': { name: 'token' },
  });

  mockedAxios.head.mockResolvedValue({ headers: { 'content-type': 'image/png; charset=binary', 'content-length': '3326406' } });

  const result = downloadMetadataFromIpfsGateways('QmCid', ['https://a.example/ipfs', 'https://b.example/ipfs']);

  await expect(result).rejects.toBeInstanceOf(MetadataTooLargeError);
  await expect(result).rejects.toThrow('https://a.example/ipfs/QmCid exceeds the 61440 byte limit (image/png, 3326406 bytes)');
  expect(mockedAxios.get).toHaveBeenCalledTimes(1);
});

test('reports a size failure without the content type when the headers cannot be fetched', async () => {
  respondPerGateway({ 'https://a.example/ipfs': new Error('maxContentLength size of 61440 exceeded') });
  mockedAxios.head.mockRejectedValue(httpError(405));

  await expect(downloadMetadataFromIpfsGateways('QmCid', ['https://a.example/ipfs'])).rejects.toThrow(
    /^https:\/\/a\.example\/ipfs\/QmCid exceeds the 61440 byte limit$/
  );
});

describe('processMetadata', () => {
  const token = { fa2_address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton', token_id: '1' };
  const lastAttempt = { job: { attempts: 6, max_attempts: 6 } } as any;

  beforeEach(() => {
    process.env.IPFS_GATEWAY = 'https://a.example/ipfs';
    (tokensDao.getByField as jest.Mock).mockResolvedValue([token]);
  });

  test('rebuilds the tokens when the metadata is given up on, so they show the error', async () => {
    respondPerGateway({ 'https://a.example/ipfs': httpError(404) });

    await processMetadata({ metadata_uri: 'ipfs://QmCid' });

    expect(metadataDao.update).toHaveBeenCalledWith('ipfs://QmCid', 'error');
    expect(addRebuildTokenJobs).toHaveBeenCalledWith([token]);
  });

  test('a listener failing on the last attempt does not mark stored metadata as an error', async () => {
    respondPerGateway({ 'https://a.example/ipfs': { name: 'token' } });
    (triggerMetadataFetched as jest.Mock).mockRejectedValue(new Error('pinning failed'));

    await expect(processMetadata({ metadata_uri: 'ipfs://QmCid' }, lastAttempt)).rejects.toThrow('pinning failed');

    expect(metadataDao.update).toHaveBeenCalledTimes(1);
    expect(metadataDao.update).toHaveBeenCalledWith('ipfs://QmCid', 'processed', { name: 'token' });
    expect(addRebuildTokenJobs).toHaveBeenCalledWith([token]);
  });
});
