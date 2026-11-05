import ObjktBuyDutchAuctionHandlerV2 from './objkt_buy_dutch_auction_v2';
import { transactionsToEvents } from '../event-producer';
import { Transactions } from '../../../types';

test('creates OBJKT_BUY_DUTCH_AUCTION_V2 events', async () => {
  const transactions: Transactions = [
    {
      id: 172704907,
      level: 2115331,
      timestamp: '2022-02-13T22:22:34Z',
      block: 'BLJPP6uFrPKxCER4tcSyPDet2NR4C1SL444SfvodCZjkRFw3eda',
      hash: 'ooniyKbJChaGDmwmVY7JHUZ3imUJvkUPHgVeaEvHC1qaGrhj53X',
      counter: 47965252,
      nonce: null,
      sender: {
        address: 'tz1ZZdLNgiA1ESH8MdrjzTzdypWPz8RKasc2',
      },
      target: {
        alias: 'objkt.com Dutch Auctions v2',
        address: 'KT1XXu88HkNzQRHNgAf7Mnq68LyS9MZJNoHP',
      },
      parameter: {
        entrypoint: 'buy',
        value: {
          proxy: null,
          amount: '11149675',
          auction_id: '1000023',
        },
      },
      amount: 11149675,
      status: 'applied',
      hasInternals: true,
      initiator: null,
      storage: {
        paused: false,
        big_map: 103267,
        auctions: 103265,
        metadata: 103266,
        upgradable: true,
        token_registry: 'KT1Pbj1uKjxZJLHyoQ2YUs4kukjvLJdheyfU',
        next_auction_id: '1000083',
        permission_module: 'KT1R8i4sXujWN69bRQFdtZ56wXcbc3qxhkTX',
      },
      diffs: [
        {
          bigmap: 103265,
          path: 'auctions',
          action: 'remove_key',
          content: {
            hash: 'expru1V6qAQjZy3tywh1YdFndR9YyawK6KTRT3hcs9bsq2L9MJc7QY',
            key: '1000023',
            value: {
              token: {
                address: 'KT1SnUZLQ4gVrQeapUvp6GY9UKKb4gAZJ8D9',
                token_id: '0',
              },
              shares: [
                {
                  amount: '500',
                  recipient: 'tz1bq5QazD43hBGxYxX8mv4sa1r1kz5sRGWz',
                },
              ],
              creator: 'tz1WaBEh29qiAEkkpJQA46GhkYSS8EBq4Qkp',
              currency: {
                tez: {},
              },
              editions: '1',
              end_time: '2022-02-13T23:07:09Z',
              end_price: '11000000',
              start_time: '2022-02-11T23:07:09Z',
              start_price: '12000000',
            },
          },
        },
      ],
    },
  ];

  const events = transactionsToEvents(transactions, [ObjktBuyDutchAuctionHandlerV2]);

  expect(events).toStrictEqual([
    {
      id: '9199866c3b0d44fa6b9ee8fd51f60166',
      type: 'OBJKT_BUY_DUTCH_AUCTION_V2',
      implements: 'SALE',
      opid: '172704907',
      ophash: 'ooniyKbJChaGDmwmVY7JHUZ3imUJvkUPHgVeaEvHC1qaGrhj53X',
      timestamp: '2022-02-13T22:22:34Z',
      level: 2115331,
      fa2_address: 'KT1SnUZLQ4gVrQeapUvp6GY9UKKb4gAZJ8D9',
      token_id: '0',
      seller_address: 'tz1WaBEh29qiAEkkpJQA46GhkYSS8EBq4Qkp',
      buyer_address: 'tz1ZZdLNgiA1ESH8MdrjzTzdypWPz8RKasc2',
      currency: 'tez',
      start_time: '2022-02-11T23:07:09Z',
      end_time: '2022-02-13T23:07:09Z',
      amount: '1',
      start_price: '12000000',
      end_price: '11000000',
      price: '11149675',
      auction_id: '1000023',
    },
  ]);
});

test('creates OBJKT_BUY_DUTCH_AUCTION_V2 events for buys that leave editions in the auction', async () => {
  const transactions: Transactions = [
    {
      id: 469936675749888,
      level: 3168842,
      timestamp: '2023-02-22T19:45:29Z',
      block: 'BMYs7SkDM3H1Fw94nc3xWmQWiysDeRWVfa91f7ZhWjX6jbTyd2K',
      hash: 'opFMRKtbdzg4B5vwLzpPEbr8VoUaCzJeCHiGLg7LiTp6gnDBNss',
      counter: 64622059,
      sender: {
        address: 'tz1ZvKXy6fdW7NikKCyx7DTMMzUG6iN11Ma6',
      },
      target: {
        address: 'KT1XXu88HkNzQRHNgAf7Mnq68LyS9MZJNoHP',
      },
      amount: 407974,
      parameter: {
        entrypoint: 'buy',
        value: {
          proxy: null,
          amount: '407974',
          auction_id: '1008002',
        },
      },
      status: 'applied',
      hasInternals: true,
      initiator: null,
      nonce: null,
      storage: {
        paused: false,
        big_map: 103267,
        auctions: 103265,
        metadata: 103266,
        upgradable: false,
        token_registry: 'KT1Pbj1uKjxZJLHyoQ2YUs4kukjvLJdheyfU',
        next_auction_id: '1008004',
        permission_module: 'KT1DF2c7VUED7W3h5BnqUKdB87Ke7XdCjQiY',
      },
      diffs: [
        {
          bigmap: 103265,
          path: 'auctions',
          action: 'update_key',
          content: {
            hash: 'exprvKGzhw8DThY2WcDotww8tLj2wn49D7HRULa6HmKe9pHtMei98Q',
            key: '1008002',
            value: {
              token: {
                address: 'KT1UV6PUBVLDtuQHX1Fbtn1nDyDSMBsKQYMm',
                token_id: '2',
              },
              shares: [
                {
                  amount: '2500',
                  recipient: 'tz1M5YNHNxgRc7yTyrBqVBhGLaJd2AVhzfxs',
                },
              ],
              creator: 'tz1M5YNHNxgRc7yTyrBqVBhGLaJd2AVhzfxs',
              currency: {
                tez: {},
              },
              editions: '49',
              end_time: '2023-02-22T23:25:03Z',
              end_price: '250000',
              start_time: '2023-02-22T17:25:03Z',
              start_price: '500000',
            },
          },
        },
      ],
    },
  ];

  const events = transactionsToEvents(transactions, [ObjktBuyDutchAuctionHandlerV2]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'OBJKT_BUY_DUTCH_AUCTION_V2',
    fa2_address: 'KT1UV6PUBVLDtuQHX1Fbtn1nDyDSMBsKQYMm',
    token_id: '2',
    seller_address: 'tz1M5YNHNxgRc7yTyrBqVBhGLaJd2AVhzfxs',
    buyer_address: 'tz1ZvKXy6fdW7NikKCyx7DTMMzUG6iN11Ma6',
    price: '407974',
    auction_id: '1008002',
    amount: '1',
  });
});
