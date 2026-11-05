import ObjktBidPreHandler from './objkt_bid_pre';
import { transactionsToEvents } from '../event-producer';
import { Transactions } from '../../../types';

test('creates OBJKT_BID_PRE events', async () => {
  const transactions: Transactions = [
    {
      id: 57371114078208,
      level: 1511757,
      timestamp: '2021-06-12T04:32:42Z',
      block: 'BLS3FgHh9owkFP37WmoYH3zHGHT5Stq8c5ygt63Kje5mcYD8aUg',
      hash: 'onqopVD4P8rQFsLz7s95E7HD43S66ZDy3iLXwcChZE87sVv3fbR',
      counter: 13852375,
      sender: { address: 'tz1V6YfNEZdyDstDyJRkw52F5CUidMrX1iwZ' },
      target: { address: 'KT1Dno3sQZwR5wUCWxzaohwuJwG3gX1VWj1Z' },
      amount: 3000000,
      parameter: { entrypoint: 'bid', value: '126087' },
      status: 'applied',
      hasInternals: false,
      initiator: null,
      nonce: null,
      storage: {
        admin: 'tz1TWrPXuG3T3rR9NR5EqsBegJMwiMcobjkt',
        objkt: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
        swaps: 4575,
        swap_id: '77',
        metadata: 4574,
        hicetnunc: 'tz1UBZUkXpKGhYsP5KtzDNqLLchwF4uHrGjw',
        hicetnunc_fee: '25',
        management_fee: '25',
      },
      diffs: [
        {
          bigmap: 4575,
          path: 'swaps',
          action: 'add_key',
          content: {
            hash: 'exprtw5iDQxiWATRdiNixRCkqLSddA81hGBsQ36qQbp9w15Sad734n',
            key: '76',
            value: { issuer: 'tz1V6YfNEZdyDstDyJRkw52F5CUidMrX1iwZ', objkt_id: '126087', xtz_per_objkt: '3000000' },
          },
        },
      ],
    },
  ];

  const events = transactionsToEvents(transactions, [ObjktBidPreHandler]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'OBJKT_BID_PRE',
    fa2_address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
    token_id: '126087',
    bid_id: '76',
    buyer_address: 'tz1V6YfNEZdyDstDyJRkw52F5CUidMrX1iwZ',
    price: '3000000',
  });
});
