import type { CatalogOverview, HeartbeatStats } from './types';

// Fallback values used when a dashboard endpoint times out or errors.
// Keeps the page renderable — the offending section shows zeros instead of
// crashing the whole RSC tree. The polling backstop will retry on the next
// interval and the section recovers without operator action.

export const EMPTY_HEARTBEAT: HeartbeatStats = {
  totalDeals: 0,
  dealsLast1h: 0,
  dealsLast24h: 0,
  dealsLast7d: 0,
  lastDealAt: null,
  oldestDealAt: null,
  resolvedDeals: 0,
  unresolvedDeals: 0,
  resolutionRate: 0,
};

export const EMPTY_OVERVIEW: CatalogOverview = {
  totalProducts: 0,
  totalMappings: 0,
  productsWithMultiSource: 0,
  productsWithSingleDeal: 0,
  couponOnlyShareLast30d: 0,
};
