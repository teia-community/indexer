import axios from 'axios';
import { downloadMetadataFromIpfsGateways, fetchMetadataFromFallback, MetadataNotFoundError } from './fetch-metadata';

jest.mock('axios');

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

test('stops at a 404 from an archive gateway', async () => {
  respondPerGateway({
    'https://a.example/ipfs': httpError(504),
    'https://archive.example/ipfs': httpError(404),
    'https://c.example/ipfs': { name: 'token' },
  });

  await expect(
    downloadMetadataFromIpfsGateways('QmCid', ['https://a.example/ipfs', 'https://archive.example/ipfs/', 'https://c.example/ipfs'], [
      'https://archive.example/ipfs',
    ])
  ).rejects.toBeInstanceOf(MetadataNotFoundError);

  expect(mockedAxios.get).not.toHaveBeenCalledWith(expect.stringContaining('c.example'), expect.anything());
});

test('a 404 from a gateway that is not an archive is not final', async () => {
  respondPerGateway({
    'https://a.example/ipfs': httpError(404),
    'https://b.example/ipfs': { name: 'token' },
  });

  await expect(
    downloadMetadataFromIpfsGateways('QmCid', ['https://a.example/ipfs', 'https://b.example/ipfs'], ['https://archive.example/ipfs'])
  ).resolves.toStrictEqual({ name: 'token' });
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
