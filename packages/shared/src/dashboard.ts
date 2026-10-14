// Admin dashboard API (/api/dashboard/*) response shapes, as they arrive over
// JSON (dates are ISO strings). Prices are in cents.

export interface HeartbeatStats {
  totalDeals: number;
  dealsLast1h: number;
  dealsLast24h: number;
  dealsLast7d: number;
  lastDealAt: string | null;
  oldestDealAt: string | null;
  /** Deals where the resolver assigned a product_id. */
  resolvedDeals: number;
  /** Deals where AI extracted a product but the resolver gave up on linking it. */
  unresolvedDeals: number;
  /**
   * Share of resolvable deals (`product != null`) that ended up linked. 0..1.
   * Coupon-only and noise deals are excluded from the denominator on purpose.
   */
  resolutionRate: number;
}

export interface CatalogOverview {
  totalProducts: number;
  totalMappings: number;
  productsWithMultiSource: number;
  productsWithSingleDeal: number;
  couponOnlyShareLast30d: number;
}

export interface MatchMethodStat {
  method: string;
  count: number;
  share: number;
}

export interface RecentDecision {
  id: number;
  dealId: number;
  productId: string | null;
  /** The product name the AI extracted from the deal text (deal.product). */
  dealProduct: string | null;
  /** The canonical name of the product the resolver linked to, if any. */
  productName: string | null;
  method: string;
  similarityScore: number | null;
  createdAt: string;
}

export interface SourceStat {
  source: string;
  mappings: number;
  uniqueProducts: number;
  /** 'specific' = store-specific URL parser; 'fallback' = host-fallback identifier. */
  identifierType: 'specific' | 'fallback';
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface PriceLeader {
  productId: string;
  canonicalName: string;
  category: string | null;
  deals: number;
  /** 10th percentile — robust "floor" (drops low outliers). */
  p10: number;
  median: number;
  /** 90th percentile — robust "ceiling" (drops high outliers). */
  p90: number;
  /** p90 / p10. Near 1 = stable price; high = wide swing or contaminated. */
  spreadRatio: number;
  /** True when the spread is implausibly wide (variant collapse / mis-extraction). */
  suspect: boolean;
}

export interface PricePoint {
  ts: string;
  price: number;
  store: string | null;
}

export interface PriceHistory {
  productId: string;
  points: PricePoint[];
  /** Percentiles computed over the returned points. */
  p10: number;
  median: number;
  p90: number;
}

export interface Anomaly {
  productId: string;
  canonicalName: string;
  category: string | null;
  deals: number;
  p10: number;
  median: number;
  p90: number;
  spreadRatio: number;
}

export type DealVerdict = 'keep' | 'unlink' | 'review';

export interface AnalyzedDeal {
  dealId: number;
  price: number;
  store: string | null;
  product: string | null;
  verdict: DealVerdict;
  /** 'unrelated' (no shared tokens) | 'spec_mismatch' | 'ok' | 'no_name'. */
  reason: string;
}

export interface ProductAnalysis {
  productId: string;
  canonicalName: string;
  median: number;
  deals: AnalyzedDeal[];
  summary: { keep: number; unlink: number; review: number };
}

export interface CleanResult {
  unlinked: number;
}

export interface OkResult {
  ok: boolean;
}

export type ExplorerSortField = 'deals' | 'p10' | 'median' | 'spread' | 'created_at';
export type SortOrder = 'asc' | 'desc';

export interface ExplorerProduct {
  id: string;
  canonicalName: string;
  category: string | null;
  deals: number;
  p10: number | null;
  median: number | null;
  p90: number | null;
  spreadRatio: number | null;
  createdAt: string;
}

export interface ProductPage {
  items: ExplorerProduct[];
  total: number;
  page: number;
  pages: number;
}

export interface TimelineEvent {
  dealId: number;
  ts: string;
  price: number;
  store: string | null;
  chat: string | null;
  description: string | null;
  coupons: { code: string; discount?: string }[] | null;
  /** True when this deal is the all-time price floor for the product. */
  isFloor: boolean;
}

export interface ProductSource {
  source: string;
  externalId: string;
  createdAt: string;
}

export interface ProductDetail {
  id: string;
  canonicalName: string;
  category: string | null;
  createdAt: string;
  /** Newest first. */
  events: TimelineEvent[];
  sources: ProductSource[];
  p10: number;
  median: number;
  p90: number;
}
