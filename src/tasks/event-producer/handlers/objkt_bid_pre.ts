import get from 'lodash/get';
import omit from 'lodash/omit';
import { assert, object, string, Describe } from 'superstruct';
import { TezosAddress, ContractAddress, IsoDateString, PositiveInteger, PgBigInt } from '../../../lib/validators';
import { TransactionHandler, TokenEvent, Transaction } from '../../../types';
import { createEventId, findDiff } from '../../../lib/utils';
import { OBJKT_CONTRACT_OFFERS_PRE } from '../../../consts';
import { tokenEventFields, bidIdField, buyerAddressField, priceField } from '../event-fields-meta';

export const EVENT_TYPE_OBJKT_BID_PRE = 'OBJKT_BID_PRE';

// the contract keeps its offers in the "swaps" bigmap. it only ever traded tokens of the contract
// in its storage (Hic et Nunc OBJKTs), so offers carry a token id but no token contract.
export function findPreOffer(transaction: Transaction, action: 'add_key' | 'remove_key', bidId?: string) {
  const diff = findDiff(transaction.diffs || [], 4575, 'swaps', action, bidId);

  if (!diff) {
    throw new Error(`offer ${bidId ?? ''} not found in the transaction's diffs`);
  }

  return {
    bidId: String(get(diff, 'content.key')),
    fa2Address: get(transaction, 'storage.objkt'),
    tokenId: get(diff, 'content.value.objkt_id'),
    buyerAddress: get(diff, 'content.value.issuer'),
    price: get(diff, 'content.value.xtz_per_objkt'),
  };
}

export interface ObjktBidPreEvent extends TokenEvent {
  type: typeof EVENT_TYPE_OBJKT_BID_PRE;
  bid_id: string;
  buyer_address: string;
  price: string;
}

const ObjktBidPreEventSchema: Describe<Omit<ObjktBidPreEvent, 'type'>> = object({
  id: string(),
  opid: PgBigInt,
  timestamp: IsoDateString,
  level: PositiveInteger,
  fa2_address: ContractAddress,
  token_id: string(),
  ophash: string(),
  bid_id: PgBigInt,
  buyer_address: TezosAddress,
  price: PgBigInt,
});

const ObjktBidPreHandler: TransactionHandler<ObjktBidPreEvent> = {
  source: 'transaction',

  type: EVENT_TYPE_OBJKT_BID_PRE,

  meta: {
    eventDescription: `An offer was made on objkt.com's first offers contract (marketplace contract: KT1Dno3sQZwR5wUCWxzaohwuJwG3gX1VWj1Z).`,
    eventFields: [...tokenEventFields, bidIdField, buyerAddressField, priceField],
  },

  accept: {
    entrypoint: 'bid',
    target_address: OBJKT_CONTRACT_OFFERS_PRE,
  },

  exec: (transaction) => {
    const offer = findPreOffer(transaction, 'add_key');

    const event: ObjktBidPreEvent = {
      id: createEventId(EVENT_TYPE_OBJKT_BID_PRE, transaction),
      type: EVENT_TYPE_OBJKT_BID_PRE,
      opid: String(transaction.id),
      ophash: transaction.hash,
      level: transaction.level,
      timestamp: transaction.timestamp,
      fa2_address: offer.fa2Address,
      token_id: offer.tokenId,
      bid_id: offer.bidId,
      buyer_address: offer.buyerAddress,
      price: offer.price,
    };

    assert(omit(event, ['type']), ObjktBidPreEventSchema);

    return event;
  },
};

export default ObjktBidPreHandler;
