import ObjktFulfillBidPreHandler from './objkt_fulfill_bid_pre';
import { transactionsToEvents } from '../event-producer';
import { Transactions } from '../../../types';

test('creates OBJKT_FULFILL_BID_PRE events', async () => {
  const transactions: Transactions = [
    {
      id: 57545246900224,
      level: 1513199,
      timestamp: '2021-06-13T05:02:34Z',
      block: 'BKtTaCxvCVFJpySoAtGZmns3zZQbVAVLL2JESAHgcGJF8F7p5DR',
      hash: 'ooSAfCr5cc77Z5U14wtDzU5nWKtUYXvpYvNbThJrf4iapmqjGLg',
      counter: 14668009,
      sender: { address: 'tz1cXfhvh6FbQPrPJ1rhbqudCmHv5zn5FwTU' },
      target: { address: 'KT1Dno3sQZwR5wUCWxzaohwuJwG3gX1VWj1Z' },
      amount: 0,
      parameter: { entrypoint: 'swap', value: '76' },
      status: 'applied',
      hasInternals: true,
      initiator: null,
      nonce: null,
      storage: {
        admin: 'tz1TWrPXuG3T3rR9NR5EqsBegJMwiMcobjkt',
        objkt: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
        swaps: 4575,
        swap_id: '101',
        metadata: 4574,
        hicetnunc: 'tz1UBZUkXpKGhYsP5KtzDNqLLchwF4uHrGjw',
        hicetnunc_fee: '25',
        management_fee: '25',
      },
      diffs: [
        {
          bigmap: 4575,
          path: 'swaps',
          action: 'remove_key',
          content: {
            hash: 'exprtw5iDQxiWATRdiNixRCkqLSddA81hGBsQ36qQbp9w15Sad734n',
            key: '76',
            value: { issuer: 'tz1V6YfNEZdyDstDyJRkw52F5CUidMrX1iwZ', objkt_id: '126087', xtz_per_objkt: '3000000' },
          },
        },
      ],
    },
  ];

  const events = transactionsToEvents(transactions, [ObjktFulfillBidPreHandler]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'OBJKT_FULFILL_BID_PRE',
    implements: 'SALE',
    fa2_address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
    token_id: '126087',
    bid_id: '76',
    price: '3000000',
    seller_address: 'tz1cXfhvh6FbQPrPJ1rhbqudCmHv5zn5FwTU',
    buyer_address: 'tz1V6YfNEZdyDstDyJRkw52F5CUidMrX1iwZ',
  });
});
