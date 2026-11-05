import get from 'lodash/get';
import omit from 'lodash/omit';
import { assert, object, string, Describe } from 'superstruct';
import { TezosAddress, ContractAddress, IsoDateString, PositiveInteger, PgBigInt } from '../../../lib/validators';
import { TransactionHandler, TokenEvent, SaleEventInterface } from '../../../types';
import { createEventId } from '../../../lib/utils';
import { OBJKT_CONTRACT_OFFERS_PRE, SALE_INTERFACE } from '../../../consts';
import { tokenSaleEventFields, bidIdField } from '../event-fields-meta';
import { findPreOffer } from './objkt_bid_pre';

export const EVENT_TYPE_OBJKT_FULFILL_BID_PRE = 'OBJKT_FULFILL_BID_PRE';

export interface ObjktFulfillBidPreEvent extends TokenEvent {
  type: typeof EVENT_TYPE_OBJKT_FULFILL_BID_PRE;
  implements: SaleEventInterface;
  bid_id: string;
  price: string;
  seller_address: string;
  buyer_address: string;
}

const ObjktFulfillBidPreEventSchema: Describe<Omit<ObjktFulfillBidPreEvent, 'type' | 'implements'>> = object({
  id: string(),
  opid: PgBigInt,
  timestamp: IsoDateString,
  level: PositiveInteger,
  fa2_address: ContractAddress,
  token_id: string(),
  ophash: string(),
  bid_id: PgBigInt,
  price: PgBigInt,
  seller_address: TezosAddress,
  buyer_address: TezosAddress,
});

const ObjktFulfillBidPreHandler: TransactionHandler<ObjktFulfillBidPreEvent> = {
  source: 'transaction',

  type: EVENT_TYPE_OBJKT_FULFILL_BID_PRE,

  meta: {
    eventDescription: `An offer was accepted on objkt.com's first offers contract (marketplace contract: KT1Dno3sQZwR5wUCWxzaohwuJwG3gX1VWj1Z).`,
    eventFields: [...tokenSaleEventFields, bidIdField],
  },

  // the contract calls accepting an offer "swap": the holder sends the token and receives the offered tez
  accept: {
    entrypoint: 'swap',
    target_address: OBJKT_CONTRACT_OFFERS_PRE,
  },

  exec: (transaction) => {
    const offer = findPreOffer(transaction, 'remove_key', String(get(transaction, 'parameter.value')));

    const event: ObjktFulfillBidPreEvent = {
      id: createEventId(EVENT_TYPE_OBJKT_FULFILL_BID_PRE, transaction),
      type: EVENT_TYPE_OBJKT_FULFILL_BID_PRE,
      implements: SALE_INTERFACE,
      opid: String(transaction.id),
      ophash: transaction.hash,
      level: transaction.level,
      timestamp: transaction.timestamp,
      fa2_address: offer.fa2Address,
      token_id: offer.tokenId,
      bid_id: offer.bidId,
      price: offer.price,
      seller_address: get(transaction, 'sender.address'),
      buyer_address: offer.buyerAddress,
    };

    assert(omit(event, ['type', 'implements']), ObjktFulfillBidPreEventSchema);

    return event;
  },
};

export default ObjktFulfillBidPreHandler;
