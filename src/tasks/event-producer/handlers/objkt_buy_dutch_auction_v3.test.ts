import ObjktBuyDutchAuctionHandlerV3 from './objkt_buy_dutch_auction_v3';
import { transactionsToEvents } from '../event-producer';
import { Transactions } from '../../../types';

test('creates OBJKT_BUY_DUTCH_AUCTION_V3 events when the last edition is bought', async () => {
  const transactions: Transactions = [
    {
      id: 2171974218416128,
      level: 10716042,
      timestamp: '2025-10-30T14:52:24Z',
      block: 'BKw6kAxSGSCKfQk1zRBTTundafFdzFppJ5snpD9K3DnKUsN8yxR',
      hash: 'opRHZJKbJmjG4pLyM733fe87fmSvQ3Sq9bQVE6BVwmKb72mCfJV',
      counter: 17749493,
      sender: { address: 'tz1aFRzMUt5xpHBkhSoMRRVjrjhSzDjePY9s' },
      target: { address: 'KT1S2Yz1a2Qn6nwLxozsyAiRwwcSRE8Q5E7E' },
      amount: 15689428103,
      parameter: {
        entrypoint: 'buy',
        value: {
          amount: '15689428103',
          editions: '1',
          proxy_for: 'tz1aFRzMUt5xpHBkhSoMRRVjrjhSzDjePY9s',
          referrers: {},
          auction_id: '2002318',
          condition_extra: null,
        },
      },
      status: 'applied',
      hasInternals: true,
      initiator: null,
      nonce: null,
      storage: {
        auctions: 574018,
        metadata: 574019,
        next_auction_id: '2002348',
        permission_module: 'KT1FzwANzQq9RdSXyF7bnC6gFeo5bDX2HP9v',
        fee_sharing_registry: 'KT1K4xtqQwEp7miTMGq1YXfdcRdjJVyZ7QYK',
      },
      diffs: [
        {
          bigmap: 574018,
          path: 'auctions',
          action: 'remove_key',
          content: {
            hash: 'expruiyEmfkAFjXTqaV1P2DCBTA2cHY4PEFQtsqZzvgN3QJ7vMfQ1i',
            key: '2002318',
            value: {
              token: { address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton', token_id: '409994' },
              shares: { tz1V7MkP1N5bBJasgDxyBvmGLxRBnjcwaNvG: '1600' },
              creator: 'tz1XxrvxyV2ts7UXdSahgC7nMFXQNDiTKWBx',
              currency: { tez: {} },
              editions: '1',
              end_time: '2025-11-02T20:20:30Z',
              condition: null,
              end_price: '12000000000',
              start_time: '2025-10-26T20:20:30Z',
              start_price: '20000000000',
              platform_fee: '500',
              referral_bonus: '0',
            },
          },
        },
      ],
    },
  ];

  const events = transactionsToEvents(transactions, [ObjktBuyDutchAuctionHandlerV3]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'OBJKT_BUY_DUTCH_AUCTION_V3',
    implements: 'SALE',
    fa2_address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
    token_id: '409994',
    seller_address: 'tz1XxrvxyV2ts7UXdSahgC7nMFXQNDiTKWBx',
    buyer_address: 'tz1aFRzMUt5xpHBkhSoMRRVjrjhSzDjePY9s',
    currency: 'tez',
    price: '15689428103',
    amount: '1',
    auction_id: '2002318',
  });
});

test('creates OBJKT_BUY_DUTCH_AUCTION_V3 events for buys that leave editions in the auction', async () => {
  const transactions: Transactions = [
    {
      id: 1327895520739328,
      level: 6638231,
      timestamp: '2024-09-20T01:47:45Z',
      block: 'BMaYJmGS5QU3fGVhvYjuiecbBabwtAGTCcQwdVqPE5zjRYYqPym',
      hash: 'onyC9uYotUDVVD9ut5TiStCg9vkUs2Jyospqe447rtiSPQwDXFv',
      counter: 11998880,
      sender: { address: 'tz1ZhteLTqobRVCYsPj44oFfom5BJ2SdGxeE' },
      target: { address: 'KT1S2Yz1a2Qn6nwLxozsyAiRwwcSRE8Q5E7E' },
      amount: 22817128,
      parameter: {
        entrypoint: 'buy',
        value: {
          amount: '22817128',
          editions: '1',
          proxy_for: 'tz1ZhteLTqobRVCYsPj44oFfom5BJ2SdGxeE',
          referrers: { tz1cgZ6PWKoER3gvW3jGKPHgBkRnpj8XzLm2: '10000' },
          auction_id: '2001063',
          condition_extra: null,
        },
      },
      status: 'applied',
      hasInternals: true,
      initiator: null,
      nonce: null,
      storage: {
        auctions: 574018,
        metadata: 574019,
        next_auction_id: '2001069',
        permission_module: 'KT1FzwANzQq9RdSXyF7bnC6gFeo5bDX2HP9v',
        fee_sharing_registry: 'KT1K4xtqQwEp7miTMGq1YXfdcRdjJVyZ7QYK',
      },
      diffs: [
        {
          bigmap: 574018,
          path: 'auctions',
          action: 'update_key',
          content: {
            hash: 'exprvDFY6NmyhmCxfYA6VZx6PYVa1LVGkKJNJYbmD1YqyFZtARmHao',
            key: '2001063',
            value: {
              token: { address: 'KT1SUPeR7cpWw5VqinFmwdxTxM9EKhscV1pK', token_id: '1' },
              shares: { tz1cgZ6PWKoER3gvW3jGKPHgBkRnpj8XzLm2: '1000' },
              creator: 'tz1cgZ6PWKoER3gvW3jGKPHgBkRnpj8XzLm2',
              currency: { tez: {} },
              editions: '8',
              end_time: '2024-09-25T01:07:28Z',
              condition: null,
              end_price: '5000000',
              start_time: '2024-09-18T01:07:28Z',
              start_price: '30000000',
              platform_fee: '500',
              referral_bonus: '0',
            },
          },
        },
      ],
    },
  ];

  const events = transactionsToEvents(transactions, [ObjktBuyDutchAuctionHandlerV3]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'OBJKT_BUY_DUTCH_AUCTION_V3',
    implements: 'SALE',
    fa2_address: 'KT1SUPeR7cpWw5VqinFmwdxTxM9EKhscV1pK',
    token_id: '1',
    seller_address: 'tz1cgZ6PWKoER3gvW3jGKPHgBkRnpj8XzLm2',
    buyer_address: 'tz1ZhteLTqobRVCYsPj44oFfom5BJ2SdGxeE',
    currency: 'tez',
    price: '22817128',
    amount: '1',
    auction_id: '2001063',
  });
});
