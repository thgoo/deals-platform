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
