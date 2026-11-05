import get from 'lodash/get';
import omit from 'lodash/omit';
import { assert, object, string, Describe } from 'superstruct';
import { TezosAddress, IsoDateString, PositiveInteger, PgBigInt, ContractAddress } from '../../../lib/validators';
import { TransactionHandler, TokenEvent, SaleEventInterface } from '../../../types';
import { findDiff, createEventId, extractObjktCurrency } from '../../../lib/utils';
import { OBJKT_CONTRACT_DUTCH_AUCTION_V3, SALE_INTERFACE } from '../../../consts';
import {
  tokenSaleEventFields,
  currencyField,
  startTimeField,
  endTimeField,
  startPriceField,
  endPriceField,
  amountField,
  auctionIdField,
} from '../event-fields-meta';

export const EVENT_TYPE_OBJKT_BUY_DUTCH_AUCTION_V3 = 'OBJKT_BUY_DUTCH_AUCTION_V3';

export interface ObjktBuyDutchAuctionV3Event extends TokenEvent {
  type: typeof EVENT_TYPE_OBJKT_BUY_DUTCH_AUCTION_V3;
  implements: SaleEventInterface;
  seller_address: string;
  buyer_address: string;
  currency: string;
  amount: string;
  start_time: string;
  end_time: string;
  start_price: string;
  end_price: string;
  price: string;
  auction_id: string;
}

const ObjktBuyDutchAuctionEventV3Schema: Describe<Omit<ObjktBuyDutchAuctionV3Event, 'type' | 'implements'>> = object({
  id: string(),
  opid: PgBigInt,
  timestamp: IsoDateString,
  level: PositiveInteger,
  fa2_address: ContractAddress,
  token_id: string(),
  ophash: string(),

  currency: string(),
  seller_address: TezosAddress,
  buyer_address: TezosAddress,
  start_time: IsoDateString,
  end_time: IsoDateString,
  start_price: PgBigInt,
  end_price: PgBigInt,
  price: PgBigInt,
  amount: PgBigInt,
  auction_id: PgBigInt,
});

const ObjktBuyDutchAuctionHandlerV3: TransactionHandler<ObjktBuyDutchAuctionV3Event> = {
  source: 'transaction',

  type: EVENT_TYPE_OBJKT_BUY_DUTCH_AUCTION_V3,

  meta: {
    eventDescription: `A token that was auctioned through a dutch auction was bought on objkt.com (marketplace contract: KT1S2Yz1a2Qn6nwLxozsyAiRwwcSRE8Q5E7E).`,
    eventFields: [
      ...tokenSaleEventFields,
      currencyField,
      startTimeField,
      endTimeField,
      startPriceField,
      endPriceField,
      amountField,
      auctionIdField,
    ],
  },

  accept: {
    entrypoint: 'buy',
    target_address: OBJKT_CONTRACT_DUTCH_AUCTION_V3,
  },

  exec: (transaction) => {
    const auctionId = get(transaction, 'parameter.value.auction_id');
    const price = get(transaction, 'parameter.value.amount');
    const amount = get(transaction, 'parameter.value.editions');
    // the token goes to proxy_for, which is set when buying on someone else's behalf
    const buyerAddress = get(transaction, 'parameter.value.proxy_for') || get(transaction, 'sender.address');
    // the contract updates the auction while editions remain and removes it with the last one
    const diff = findDiff(transaction.diffs!, 574018, 'auctions', ['update_key', 'remove_key'], auctionId);

    if (!diff) {
      throw new Error(`auction ${auctionId} not found in the transaction's diffs`);
    }

    const currency = extractObjktCurrency(get(diff, 'content.value.currency'));

    if (!currency) {
      throw new Error(`currency not set`);
    }

    const event: ObjktBuyDutchAuctionV3Event = {
      id: createEventId(EVENT_TYPE_OBJKT_BUY_DUTCH_AUCTION_V3, transaction),
      type: EVENT_TYPE_OBJKT_BUY_DUTCH_AUCTION_V3,
      implements: SALE_INTERFACE,
      opid: String(transaction.id),
      ophash: transaction.hash,
      timestamp: transaction.timestamp,
      level: transaction.level,
      currency,
      fa2_address: get(diff, 'content.value.token.address'),
      token_id: get(diff, 'content.value.token.token_id'),
      seller_address: get(diff, 'content.value.creator'),
      buyer_address: buyerAddress,
      start_time: get(diff, 'content.value.start_time'),
      end_time: get(diff, 'content.value.end_time'),
      start_price: get(diff, 'content.value.start_price'),
      end_price: get(diff, 'content.value.end_price'),
      price,
      auction_id: auctionId,
      amount,
    };

    assert(omit(event, ['type', 'implements']), ObjktBuyDutchAuctionEventV3Schema);

    return event;
  },
};

export default ObjktBuyDutchAuctionHandlerV3;
