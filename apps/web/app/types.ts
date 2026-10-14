import type { DealsPageDto } from '@bargah/shared';

// API response shapes live in @bargah/shared, next to the api code that produces them.
export type {
  Coupon,
  DealDto,
  DealsPageDto,
  ImageUpdatedEvent,
  PriceHistoryItem,
  PriceHistoryResponse,
  PriceHistoryStats,
} from '@bargah/shared';

export interface DealFilters {
  search: string;
  stores: string[];
}

/** First page of deals rendered on the server, plus the store list for the filters. */
export type InitialDeals = DealsPageDto & { availableStores?: string[] };
