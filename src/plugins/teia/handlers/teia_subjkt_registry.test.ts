import TeiaSubjktRegistry from './teia_subjkt_registry';
import { transactionsToEvents } from '../../../tasks/event-producer/event-producer';
import { Transactions } from '../../../types';

test('creates TEIA_SUBJKT_REGISTRY events', async () => {
  const transactions: Transactions = [
    {
      id: 57629612179456,
      level: 1514368,
      timestamp: '2021-06-14T00:53:34Z',
      block: 'BM4imz8JBJP1ujUSLpgSLJbGSgE6tnwytb7oCgwJMtFS6Xravu4',
      hash: 'oopkvwQNfQtHJ4ot7ZEFhKEMpuiJUz6oxiYCCxxxNuWj8XVhTof',
      counter: 17305435,
      sender: {
        address: 'tz1gfqsHkYgJWsCVQ9vG19R6RS8sYco4uvwD',
      },
      target: {
        alias: 'Hic et Nunc Name Registry',
        address: 'KT1My1wDZHDGweCrJnQJi3wcFaS67iksirvj',
      },
      amount: 0,
      parameter: {
        entrypoint: 'registry',
        value: {
          subjkt: '616c6578612e617274',
          metadata: '697066733a2f2f516d584b4c474242764a34503141624c4a765352594c334d4b677875757744484a545368394841524e5543365835',
        },
      },
      status: 'applied',
      hasInternals: false,
      initiator: null,
      storage: {
        entries: 3916,
        manager: 'tz1Y1j7FK1X9Rrv2VdPz5bXoU7SszF8W1RnK',
        subjkts: 3920,
        invoices: 3917,
        metadata: 3918,
        registries: 3919,
        subjkts_metadata: 3921,
      },
      diffs: [
        {
          bigmap: 3921,
          path: 'subjkts_metadata',
          action: 'add_key',
          content: {
            hash: 'expruPNi5bWLgonu2RetaTR5F9saZf7o7sk1KraoohG1YPR8Br4ckT',
            key: '616c6578612e617274',
            value: '697066733a2f2f516d584b4c474242764a34503141624c4a765352594c334d4b677875757744484a545368394841524e5543365835',
          },
        },
        {
          bigmap: 3920,
          path: 'subjkts',
          action: 'add_key',
          content: {
            hash: 'expruPNi5bWLgonu2RetaTR5F9saZf7o7sk1KraoohG1YPR8Br4ckT',
            key: '616c6578612e617274',
            value: true,
          },
        },
        {
          bigmap: 3919,
          path: 'registries',
          action: 'add_key',
          content: {
            hash: 'exprvEHUXqDzGWQejr4KStwEfGrkvoLcrEh7ESmKSSdSVNvfGhqsgb',
            key: 'tz1gfqsHkYgJWsCVQ9vG19R6RS8sYco4uvwD',
            value: '616c6578612e617274',
          },
        },
        {
          bigmap: 3916,
          path: 'entries',
          action: 'add_key',
          content: {
            hash: 'exprvEHUXqDzGWQejr4KStwEfGrkvoLcrEh7ESmKSSdSVNvfGhqsgb',
            key: 'tz1gfqsHkYgJWsCVQ9vG19R6RS8sYco4uvwD',
            value: true,
          },
        },
      ],
      nonce: null,
    },
  ];

  const events = transactionsToEvents(transactions, [TeiaSubjktRegistry]);

  expect(events).toStrictEqual([
    {
      id: '503befa42d6bb3810b5bccb3dd71af17',
      type: 'TEIA_SUBJKT_REGISTRY',
      opid: '57629612179456',
      ophash: 'oopkvwQNfQtHJ4ot7ZEFhKEMpuiJUz6oxiYCCxxxNuWj8XVhTof',
      timestamp: '2021-06-14T00:53:34Z',
      level: 1514368,
      owner_address: 'tz1gfqsHkYgJWsCVQ9vG19R6RS8sYco4uvwD',
      metadata_uri: 'ipfs://QmXKLGBBvJ4P1AbLJvSRYL3MKgxuuwDHJTSh9HARNUC6X5',
      custom_data: {
        subjkt: 'alexa.art',
      },
    },
  ]);
});

test('strips null characters from the subjkt', async () => {
  const transactions: Transactions = [
    {
      id: 59526468337664,
      level: 1528954,
      timestamp: '2021-06-24T08:22:14Z',
      block: 'BM8rX8fZ7NBWUSHJCuNVisS93tn8MYdgFcAvu98BPHdorSWXPXR',
      hash: 'oocGA6Hb1WBMFYucPARF7QusiWERnwQuQeQZiBAvREEhyAFgbmo',
      counter: 16867651,
      sender: {
        address: 'tz1Z2eDxninkqDG6dW7cd9muvjwWjZMBKb8k',
      },
      target: {
        alias: 'Hic et Nunc Name Registry',
        address: 'KT1My1wDZHDGweCrJnQJi3wcFaS67iksirvj',
      },
      amount: 0,
      parameter: {
        entrypoint: 'registry',
        value: {
          subjkt: '280028002800',
          metadata: '697066733a2f2f516d52635039346b5872357a5a6a52477669376d4a36756e374c7078556859565234523452706963787a67596b74',
        },
      },
      status: 'applied',
      hasInternals: false,
      initiator: null,
      nonce: null,
    },
  ];

  const events = transactionsToEvents(transactions, [TeiaSubjktRegistry]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    owner_address: 'tz1Z2eDxninkqDG6dW7cd9muvjwWjZMBKb8k',
    metadata_uri: 'ipfs://QmRcP94kXr5zZjRGvi7mJ6un7LpxUhYVR4R4RpicxzgYkt',
    custom_data: {
      subjkt: '(((',
    },
  });
});
