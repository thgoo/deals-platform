import { and, eq, inArray, sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productMatchDecisionsTable } from '~/db/schemas/product-match-decisions';
import { productsTable } from '~/db/schemas/products';
import { sharedTokenCount } from '~/products/utils/product-name-tokens';
import { specsConflict } from '~/products/utils/spec-conflict';
import { createTtlCache } from '../cache';

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
  /** Why the verdict — 'unrelated' (no shared tokens) | 'spec_mismatch' | 'ok' | 'no_name'. */
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

// Products with a price band this wide are almost always contaminated.
const SUSPECT_SPREAD_RATIO = 3;
const ANOMALIES_TTL_MS = 60_000;

export default class CatalogCleanupService {
  private anomaliesCache = createTtlCache<Anomaly[]>(ANOMALIES_TTL_MS);

  /**
   * Suspect products: enough deals to have a stable median, but a p90/p10 band
   * so wide it can't be a single product. These are the cleanup queue.
   */
  async getAnomalies(minDeals: number, limit: number): Promise<Anomaly[]> {
    return this.anomaliesCache.get(() => this.computeAnomalies(minDeals, limit));
  }

  private async computeAnomalies(minDeals: number, limit: number): Promise<Anomaly[]> {
    const rows = await db.execute<{
      product_id: string;
      canonical_name: string;
      category: string | null;
      deals: number | string;
      p10: number | string;
      med: number | string;
      p90: number | string;
    }>(sql`
      WITH eligible AS (
        SELECT product_id
        FROM deals
        WHERE price IS NOT NULL AND product_id IS NOT NULL
        GROUP BY product_id
        HAVING COUNT(*) >= ${sql.raw(String(minDeals))}
      )
      SELECT product_id, canonical_name, category, deals, p10, med, p90
      FROM (
        SELECT DISTINCT
          p.id              AS product_id,
          p.canonical_name  AS canonical_name,
          p.category        AS category,
          COUNT(d.id)          OVER (PARTITION BY p.id) AS deals,
          ROUND(PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY d.price) OVER (PARTITION BY p.id)) AS p10,
          ROUND(MEDIAN(d.price)      OVER (PARTITION BY p.id))                  AS med,
          ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY d.price) OVER (PARTITION BY p.id)) AS p90
        FROM products p
        JOIN deals d    ON d.product_id = p.id
        JOIN eligible e ON e.product_id = p.id
        WHERE d.price IS NOT NULL
      ) t
      WHERE p10 > 0 AND (p90 / p10) > ${sql.raw(String(SUSPECT_SPREAD_RATIO))}
      ORDER BY (p90 / p10) DESC
      LIMIT ${sql.raw(String(limit))}
    `);

    return readRows<{
      product_id: string;
      canonical_name: string;
      category: string | null;
      deals: number | string;
      p10: number | string;
      med: number | string;
      p90: number | string;
    }>(rows).map(r => {
      const p10 = Number(r.p10);
      const p90 = Number(r.p90);
      return {
        productId: r.product_id,
        canonicalName: r.canonical_name,
        category: r.category,
        deals: Number(r.deals),
        p10,
        median: Number(r.med),
        p90,
        spreadRatio: p10 === 0 ? 0 : Number((p90 / p10).toFixed(2)),
      };
    });
  }

  /**
   * Per-deal verdict for one product. Pure read — no mutation. The dashboard
   * shows this and lets the operator confirm before anything is unlinked.
   *
   *   unrelated (0 shared tokens) → suggest unlink
   *   spec_mismatch (shared tokens but conflicting spec) → suggest unlink
   *   no extracted name → review (can't auto-decide)
   *   otherwise → keep
   */
  async analyzeProduct(productId: string): Promise<ProductAnalysis | null> {
    const [product] = await db
      .select({ canonicalName: productsTable.canonicalName })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) return null;

    const dealRows = await db
      .select({
        id: dealsTable.id,
        price: dealsTable.price,
        store: dealsTable.store,
        product: dealsTable.product,
      })
      .from(dealsTable)
      .where(eq(dealsTable.productId, productId));

    const canonical = product.canonicalName;
    const summary = { keep: 0, unlink: 0, review: 0 };

    const deals: AnalyzedDeal[] = dealRows.map(d => {
      const { verdict, reason } = classify(d.product, canonical);
      summary[verdict]++;
      return {
        dealId: d.id,
        price: d.price ?? 0,
        store: d.store,
        product: d.product,
        verdict,
        reason,
      };
    });

    // Cheapest-first puts garbage (low-price junk on an expensive product) up top.
    deals.sort((a, b) => a.price - b.price);

    const pricedSorted = deals.map(d => d.price).filter(p => p > 0).sort((a, b) => a - b);

    return {
      productId,
      canonicalName: canonical,
      median: medianOf(pricedSorted),
      deals,
      summary,
    };
  }

  /**
   * Unlinks the given deals from the product (sets product_id = NULL). Scoped
   * to the product on purpose: a stale/forged dealId from another product can't
   * touch rows it doesn't own. Unlinked deals are picked up by the next
   * `backfill:products` run and re-resolved against the (cleaner) catalog.
   */
  async cleanProduct(productId: string, dealIds: number[]): Promise<CleanResult> {
    if (dealIds.length === 0) return { unlinked: 0 };

    let unlinked = 0;
    const CHUNK = 500;
    for (let i = 0; i < dealIds.length; i += CHUNK) {
      const batch = dealIds.slice(i, i + CHUNK);
      const result = await db
        .update(dealsTable)
        .set({ productId: null })
        .where(and(
          eq(dealsTable.productId, productId),
          inArray(dealsTable.id, batch),
        ));
      unlinked += drizzleAffectedRows(result);
    }

    this.anomaliesCache.invalidate();
    return { unlinked };
  }

  /**
   * Corrects a single deal's price (in cents). For the common case of an AI
   * mis-parse ("R$ 367,46" extracted as 367460) — the deal belongs to the
   * product, only the value is wrong. The raw `deals.text` is left untouched as
   * the source of truth; only the cleaned `price` field changes.
   */
  async updateDealPrice(dealId: number, priceCents: number): Promise<{ ok: boolean }> {
    const result = await db
      .update(dealsTable)
      .set({ price: priceCents })
      .where(eq(dealsTable.id, dealId));

    this.anomaliesCache.invalidate();
    return { ok: drizzleAffectedRows(result) > 0 };
  }

  /**
   * Hard-deletes a junk deal. Its match-decision rows are removed first to
   * satisfy the FK (product_match_decisions.deal_id → deals.id, ON DELETE NO
   * ACTION). Both run in one transaction.
   */
  async deleteDeal(dealId: number): Promise<{ ok: boolean }> {
    const ok = await db.transaction(async tx => {
      await tx
        .delete(productMatchDecisionsTable)
        .where(eq(productMatchDecisionsTable.dealId, dealId));
      const result = await tx.delete(dealsTable).where(eq(dealsTable.id, dealId));
      return drizzleAffectedRows(result) > 0;
    });

    this.anomaliesCache.invalidate();
    return { ok };
  }
}

function classify(dealName: string | null, canonical: string): { verdict: DealVerdict; reason: string } {
  if (!dealName) return { verdict: 'review', reason: 'no_name' };
  if (sharedTokenCount(dealName, canonical) === 0) return { verdict: 'unlink', reason: 'unrelated' };
  if (specsConflict(dealName, canonical)) return { verdict: 'unlink', reason: 'spec_mismatch' };
  return { verdict: 'keep', reason: 'ok' };
}

function medianOf(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2) : (sorted[mid] ?? 0);
}

function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]);
  }
  return [];
}

function drizzleAffectedRows(result: unknown): number {
  if (Array.isArray(result) && result[0] && typeof result[0] === 'object') {
    return (result[0] as { affectedRows?: number }).affectedRows ?? 0;
  }
  return 0;
}
