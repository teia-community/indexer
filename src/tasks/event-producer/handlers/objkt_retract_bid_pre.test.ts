import ObjktRetractBidPreHandler from './objkt_retract_bid_pre';
import { transactionsToEvents } from '../event-producer';
import { Transactions } from '../../../types';

test('creates OBJKT_RETRACT_BID_PRE events', async () => {
  const transactions: Transactions = [
    {
      id: 57216157614080,
      level: 1510518,
      timestamp: '2021-06-11T07:35:18Z',
      block: 'BKiyAmftqYE1BcuGg9ExNMCs41tfVsH6njPABZGvAhW4wKwmeaW',
      hash: 'ooDaAgVEczBvoSy4j9jHvcC6JYLtaSuG2Rpn6VpwxQiKMZfW5SW',
      counter: 15957307,
      sender: { address: 'tz1XHhjLXQuG9rf9n7o1VbgegMkiggy1oktu' },
      target: { address: 'KT1Dno3sQZwR5wUCWxzaohwuJwG3gX1VWj1Z' },
      amount: 0,
      parameter: { entrypoint: 'retract_bid', value: '21' },
      status: 'applied',
      hasInternals: true,
      initiator: null,
      nonce: null,
      storage: {
        admin: 'tz1TWrPXuG3T3rR9NR5EqsBegJMwiMcobjkt',
        objkt: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
        swaps: 4575,
        swap_id: '37',
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
            hash: 'exprutEDSQUwyxo81jG2M2XUQ5BZ392Ca8SDU3BcD1MTfwtGzbKSjd',
            key: '21',
            value: { issuer: 'tz1XHhjLXQuG9rf9n7o1VbgegMkiggy1oktu', objkt_id: '111575', xtz_per_objkt: '30000' },
          },
        },
      ],
    },
  ];

  const events = transactionsToEvents(transactions, [ObjktRetractBidPreHandler]);

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'OBJKT_RETRACT_BID_PRE',
    fa2_address: 'KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton',
    token_id: '111575',
    bid_id: '21',
    buyer_address: 'tz1XHhjLXQuG9rf9n7o1VbgegMkiggy1oktu',
  });
});
