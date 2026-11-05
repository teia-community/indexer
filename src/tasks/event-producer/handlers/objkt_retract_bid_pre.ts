import get from 'lodash/get';
import omit from 'lodash/omit';
import { assert, object, string, Describe } from 'superstruct';
import { TezosAddress, ContractAddress, IsoDateString, PositiveInteger, PgBigInt } from '../../../lib/validators';
import { TransactionHandler, TokenEvent } from '../../../types';
import { createEventId } from '../../../lib/utils';
import { OBJKT_CONTRACT_OFFERS_PRE } from '../../../consts';
import { tokenEventFields, bidIdField, buyerAddressField } from '../event-fields-meta';
import { findPreOffer } from './objkt_bid_pre';

export const EVENT_TYPE_OBJKT_RETRACT_BID_PRE = 'OBJKT_RETRACT_BID_PRE';

export interface ObjktRetractBidPreEvent extends TokenEvent {
  type: typeof EVENT_TYPE_OBJKT_RETRACT_BID_PRE;
  bid_id: string;
  buyer_address: string;
}

const ObjktRetractBidPreEventSchema: Describe<Omit<ObjktRetractBidPreEvent, 'type'>> = object({
  id: string(),
  opid: PgBigInt,
  timestamp: IsoDateString,
  level: PositiveInteger,
  fa2_address: ContractAddress,
  token_id: string(),
  ophash: string(),
  bid_id: PgBigInt,
  buyer_address: TezosAddress,
});

const ObjktRetractBidPreHandler: TransactionHandler<ObjktRetractBidPreEvent> = {
  source: 'transaction',

  type: EVENT_TYPE_OBJKT_RETRACT_BID_PRE,

  meta: {
    eventDescription: `An offer was withdrawn on objkt.com's first offers contract (marketplace contract: KT1Dno3sQZwR5wUCWxzaohwuJwG3gX1VWj1Z).`,
    eventFields: [...tokenEventFields, bidIdField, buyerAddressField],
  },

  accept: {
    entrypoint: 'retract_bid',
    target_address: OBJKT_CONTRACT_OFFERS_PRE,
  },

  exec: (transaction) => {
    const offer = findPreOffer(transaction, 'remove_key', String(get(transaction, 'parameter.value')));

    const event: ObjktRetractBidPreEvent = {
      id: createEventId(EVENT_TYPE_OBJKT_RETRACT_BID_PRE, transaction),
      type: EVENT_TYPE_OBJKT_RETRACT_BID_PRE,
      opid: String(transaction.id),
      ophash: transaction.hash,
      level: transaction.level,
      timestamp: transaction.timestamp,
      fa2_address: offer.fa2Address,
      token_id: offer.tokenId,
      bid_id: offer.bidId,
      buyer_address: offer.buyerAddress,
    };

    assert(omit(event, ['type']), ObjktRetractBidPreEventSchema);

    return event;
  },
};

export default ObjktRetractBidPreHandler;
