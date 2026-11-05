const HEN = 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton';
const OTHER = 'KT1MxDwChiDwd6WBVs24g1NjERUoK622ZEFp';
const HDAO = 'KT1AFA2mwNUMNd4SsujE1YYp29vd8BZejyKW'; // in the built-in ignore list

function loadWith(allowed: string | undefined) {
  let mod: typeof import('./utils') | undefined;
  const previous = process.env.ALLOWED_FA2_CONTRACT_ADDRESS;

  if (allowed === undefined) {
    delete process.env.ALLOWED_FA2_CONTRACT_ADDRESS;
  } else {
    process.env.ALLOWED_FA2_CONTRACT_ADDRESS = allowed;
  }

  jest.isolateModules(() => {
    mod = require('./utils');
  });

  if (previous === undefined) {
    delete process.env.ALLOWED_FA2_CONTRACT_ADDRESS;
  } else {
    process.env.ALLOWED_FA2_CONTRACT_ADDRESS = previous;
  }

  return mod!;
}

test('only the allowed contracts are indexed when ALLOWED_FA2_CONTRACT_ADDRESS is set', () => {
  const { isIndexedContract } = loadWith(`${HEN}, ${OTHER}`);

  expect(isIndexedContract(HEN)).toBe(true);
  expect(isIndexedContract(OTHER)).toBe(true);
  expect(isIndexedContract(HDAO)).toBe(false);
  expect(isIndexedContract('KT1SomethingElse')).toBe(false);
});

test('every contract except the ignored ones is indexed when it is not set', () => {
  const { isIndexedContract } = loadWith(undefined);

  expect(isIndexedContract(HEN)).toBe(true);
  expect(isIndexedContract(OTHER)).toBe(true);
  expect(isIndexedContract(HDAO)).toBe(false);
});
