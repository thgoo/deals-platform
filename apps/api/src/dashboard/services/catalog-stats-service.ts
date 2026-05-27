import { desc, sql } from 'drizzle-orm';
import type CandidateSearchService from '~/products/services/candidate-search-service';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productMatchDecisionsTable } from '~/db/schemas/product-match-decisions';
import { productUrlMappingsTable } from '~/db/schemas/product-url-mappings';
import { productsTable } from '~/db/schemas/products';

// Identifier modules that ship a store-specific URL parser (not the host
// fallback). MUST stay in sync with `src/link-pipeline/identifiers/providers/`.
// The dashboard uses this to label each source as `specific` vs `fallback`.
const SPECIFIC_IDENTIFIERS = new Set([
  'amazon',
  'aliexpress',
  'kabum',
  'magalu',
  'mercadolivre',
  'pichau',
  'shopee',
]);

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

export interface DuplicateSuspect {
  productA: { id: string; canonicalName: string };
  productB: { id: string; canonicalName: string };
  similarity: number;
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
  createdAt: Date;
}

export interface SourceStat {
  source: string;
  mappings: number;
  uniqueProducts: number;
  /** 'specific' = store-specific URL parser; 'fallback' = host-fallback identifier. */
  identifierType: 'specific' | 'fallback';
}

export default class CatalogStatsService {
  constructor(private readonly candidateSearch: CandidateSearchService) {}

  /**
   * Five top-level KPIs about the catalog itself — answers "how well are we
   * deduplicating products and connecting cross-store deals?".
   */
  async getOverview(): Promise<CatalogOverview> {
    const [
      [productsRow],
      [mappingsRow],
      multiSourceRows,
      singleDealRows,
      couponRows,
    ] = await Promise.all([
      db.select({ count: sql<string>`COUNT(*)` }).from(productsTable),
      db.select({ count: sql<string>`COUNT(*)` }).from(productUrlMappingsTable),
      db.execute<{ count: number | string }>(sql`
        SELECT COUNT(*) AS count FROM (
          SELECT product_id FROM product_url_mappings
          GROUP BY product_id HAVING COUNT(DISTINCT source) > 1
        ) t
      `),
      db.execute<{ count: number | string }>(sql`
        SELECT COUNT(*) AS count FROM (
          SELECT product_id FROM deals
          WHERE product_id IS NOT NULL
          GROUP BY product_id HAVING COUNT(*) = 1
        ) t
      `),
      db.execute<{ share: string | number | null }>(sql`
        SELECT
          100.0 * SUM(CASE WHEN product IS NULL AND coupons IS NOT NULL AND JSON_LENGTH(coupons) > 0 THEN 1 ELSE 0 END)
          / NULLIF(COUNT(*), 0) AS share
        FROM deals
        WHERE ts > NOW() - INTERVAL 30 DAY
      `),
    ]);

    const multiSourceCount = readScalar(multiSourceRows, 'count');
    const singleDealCount = readScalar(singleDealRows, 'count');
    const couponShare = readScalar(couponRows, 'share');

    return {
      totalProducts: Number(productsRow?.count ?? 0),
      totalMappings: Number(mappingsRow?.count ?? 0),
      productsWithMultiSource: Number(multiSourceCount ?? 0),
      productsWithSingleDeal: Number(singleDealCount ?? 0),
      couponOnlyShareLast30d: couponShare === null ? 0 : Number(couponShare),
    };
  }

  /**
   * Distribution of how recent deals were resolved into products. Reveals
   * whether the cheap paths (url_anchor, embedding_only) are doing most of the
   * work or if too many decisions are falling to llm_judge / created_new.
   */
  async getMatchMethodStats(days: number): Promise<MatchMethodStat[]> {
    const rows = await db.execute<{ method: string; count: number | string }>(sql`
      SELECT method, COUNT(*) AS count
      FROM product_match_decisions
      WHERE created_at > NOW() - INTERVAL ${sql.raw(String(days))} DAY
      GROUP BY method
      ORDER BY count DESC
    `);

    const list = readRows<{ method: string; count: number | string }>(rows);
    const total = list.reduce((sum, r) => sum + Number(r.count), 0);

    return list.map(r => ({
      method: r.method,
      count: Number(r.count),
      share: total === 0 ? 0 : Number(r.count) / total,
    }));
  }

  /**
   * Pairs of products with cosine similarity above `threshold`. These are
   * likely the SAME product that should have been merged — they signal either
   * a mis-tuned AUTO_MATCH threshold or an LLM judge that's too conservative.
   *
   * Cost: O(N²) over the in-memory embedding cache. For N=5k → ~12M dot
   * products of 1536-dim vectors → ~1s in Bun. Acceptable for an admin tool.
   */
  findDuplicateSuspects(threshold: number, limit: number): DuplicateSuspect[] {
    return this.candidateSearch.findDuplicatePairs({ threshold, limit });
  }

  /**
   * Last N match decisions with their winning candidate's name resolved.
   * Joins the deal so spot-check is "what AI extracted" vs "what we matched to".
   */
  async getRecentDecisions(limit: number): Promise<RecentDecision[]> {
    const rows = await db
      .select({
        id: productMatchDecisionsTable.id,
        dealId: productMatchDecisionsTable.dealId,
        productId: productMatchDecisionsTable.productId,
        dealProduct: dealsTable.product,
        productName: productsTable.canonicalName,
        method: productMatchDecisionsTable.method,
        similarityScore: productMatchDecisionsTable.similarityScore,
        createdAt: productMatchDecisionsTable.createdAt,
      })
      .from(productMatchDecisionsTable)
      .leftJoin(dealsTable, sql`${productMatchDecisionsTable.dealId} = ${dealsTable.id}`)
      .leftJoin(productsTable, sql`${productMatchDecisionsTable.productId} = ${productsTable.id}`)
      .orderBy(desc(productMatchDecisionsTable.createdAt))
      .limit(limit);

    return rows.map(r => ({
      id: r.id,
      dealId: r.dealId,
      productId: r.productId,
      dealProduct: r.dealProduct,
      productName: r.productName,
      method: r.method,
      similarityScore: r.similarityScore === null ? null : Number(r.similarityScore),
      createdAt: r.createdAt,
    }));
  }

  /**
   * Distribution of url-mappings across sources. The `identifierType` flag
   * separates store-specific parsers (amazon, mercadolivre, kabum, ...) from
   * the host-fallback bucket. If a known store like `amazon` suddenly drops
   * to zero mappings, the specific identifier likely broke.
   */
  async getSourceDistribution(): Promise<SourceStat[]> {
    const rows = await db
      .select({
        source: productUrlMappingsTable.source,
        mappings: sql<string>`COUNT(*)`,
        uniqueProducts: sql<string>`COUNT(DISTINCT ${productUrlMappingsTable.productId})`,
      })
      .from(productUrlMappingsTable)
      .groupBy(productUrlMappingsTable.source)
      .orderBy(desc(sql`COUNT(*)`));

    return rows.map(r => ({
      source: r.source,
      mappings: Number(r.mappings),
      uniqueProducts: Number(r.uniqueProducts),
      identifierType: SPECIFIC_IDENTIFIERS.has(r.source) ? 'specific' : 'fallback',
    }));
  }
}

// mysql2 may return either a plain rows array or `{ rows, fields }` depending on the call.
// Both shapes show up across drizzle versions — normalize once at the boundary.
function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]);
  }
  return [];
}

function readScalar<K extends string>(result: unknown, key: K): unknown {
  const rows = readRows<Record<K, unknown>>(result);
  return rows[0]?.[key] ?? null;
}
