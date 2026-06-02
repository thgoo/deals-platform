// Response shapes from core-api /api/dashboard/*. Kept in sync by hand —
// these are operator-facing endpoints, low churn, no need for codegen.

export interface HeartbeatStats {
  totalDeals: number;
  dealsLast1h: number;
  dealsLast24h: number;
  dealsLast7d: number;
  lastDealAt: string | null;
  oldestDealAt: string | null;
  resolvedDeals: number;
  unresolvedDeals: number;
  /** Fraction in [0, 1] of resolvable deals that ended up linked to a product. */
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
  /** Name the AI extracted from the deal text. */
  dealProduct: string | null;
  /** Canonical name of the product the resolver linked to, if any. */
  productName: string | null;
  method: string;
  similarityScore: number | null;
  createdAt: string;
}

export interface SourceStat {
  source: string;
  mappings: number;
  uniqueProducts: number;
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
  /** Percentile prices in cents. p10 = robust floor, p90 = robust ceiling. */
  p10: number;
  median: number;
  p90: number;
  /** p90 / p10 — near 1 is a stable price, high flags a contaminated band. */
  spreadRatio: number;
  suspect: boolean;
}

export interface PricePoint {
  ts: string;
  /** Price in cents. */
  price: number;
  store: string | null;
}

export interface PriceHistory {
  productId: string;
  points: PricePoint[];
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
  reason: string;
}

export interface ProductAnalysis {
  productId: string;
  canonicalName: string;
  median: number;
  deals: AnalyzedDeal[];
  summary: { keep: number; unlink: number; review: number };
}

export type ExplorerSortField =
  | 'deals'
  | 'p10'
  | 'median'
  | 'spread'
  | 'created_at';
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
  events: TimelineEvent[];
  sources: ProductSource[];
  p10: number;
  median: number;
  p90: number;
}
