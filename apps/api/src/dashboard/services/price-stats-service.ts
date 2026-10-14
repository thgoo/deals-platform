import type { PriceHistory, PriceLeader, PricePoint } from '@bargah/shared';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { toIsoString } from '~/utils/dates';
import { isUuid } from '~/utils/ids';
import { createTtlCache } from '../cache';

/**
 * Above this p90/p10 ratio a product's price band is treated as untrustworthy:
 * either two distinct models collapsed into one canonical (iPhone 16 vs 16e) or
 * a garbage extraction slipped in. Surfaced as `suspect` so the UI can flag it
 * AND so the same signal can later feed a catalog-cleanup queue.
 */
const SUSPECT_SPREAD_RATIO = 3;

// Price stats span the whole history and change only as new deals trickle in,
// so a long TTL is fine. The percentile window query is ~2s cold; SWR means
// only the first caller after expiry pays that, everyone else gets it instant.
const PRICE_LEADERS_TTL_MS = 5 * 60_000;

export default class PriceStatsService {
  private leadersCache = createTtlCache<PriceLeader[]>(PRICE_LEADERS_TTL_MS);

  /**
   * Products ranked by deal count, each with a robust price band (p10 / median
   * / p90) over all of its history. This is the backbone of the price-floor
   * tracker and the anomaly detector — both read from the same numbers.
   *
   * Percentiles (not MIN/MAX) on purpose: a single mis-matched deal can't drag
   * the floor or ceiling, so the band reflects the real promotional range.
   */
  async getPriceLeaders(limit: number, minDeals: number): Promise<PriceLeader[]> {
    return this.leadersCache.get(() => this.computePriceLeaders(limit, minDeals));
  }

  /** Clears the price-leaders cache so it recomputes after catalog edits. */
  invalidateCaches(): void {
    this.leadersCache.invalidate();
  }

  private async computePriceLeaders(limit: number, minDeals: number): Promise<PriceLeader[]> {
    // Resolve the top-N products by deal count with a cheap GROUP BY first, then
    // compute percentiles over only those N products.
    // round() on percentile_cont's double precision rounds half to even, exactly
    // like MariaDB's ROUND() on the PERCENTILE_CONT double it replaces.
    const rows = await db.execute<{
      product_id: string;
      canonical_name: string;
      category: string | null;
      deals: string;
      p10: string;
      med: string;
      p90: string;
    }>(sql`
      WITH eligible AS (
        SELECT product_id
        FROM deals
        WHERE price IS NOT NULL AND product_id IS NOT NULL
        GROUP BY product_id
        HAVING COUNT(*) >= ${minDeals}
        ORDER BY COUNT(*) DESC
        LIMIT ${limit}
      )
      SELECT
        p.id             AS product_id,
        p.canonical_name AS canonical_name,
        p.category       AS category,
        COUNT(d.id)      AS deals,
        round(percentile_cont(0.1) WITHIN GROUP (ORDER BY d.price)) AS p10,
        round(percentile_cont(0.5) WITHIN GROUP (ORDER BY d.price)) AS med,
        round(percentile_cont(0.9) WITHIN GROUP (ORDER BY d.price)) AS p90
      FROM products p
      JOIN eligible e ON e.product_id = p.id
      JOIN deals d    ON d.product_id = p.id AND d.price IS NOT NULL
      GROUP BY p.id
      ORDER BY deals DESC
    `);

    return rows.map(r => {
      const p10 = Number(r.p10);
      const median = Number(r.med);
      const p90 = Number(r.p90);
      const spreadRatio = p10 === 0 ? 0 : Number((p90 / p10).toFixed(2));
      return {
        productId: r.product_id,
        canonicalName: r.canonical_name,
        category: r.category,
        deals: Number(r.deals),
        p10,
        median,
        p90,
        spreadRatio,
        suspect: spreadRatio > SUSPECT_SPREAD_RATIO,
      };
    });
  }

  /**
   * Full price-over-time series for a single product, plus the same p10 / median
   * / p90 band computed in JS over the returned points (cheap: one product is
   * tens of rows, no need for the heavy window query).
   *
   * Not cached: productId varies per call and the single-slot cache is built for
   * fixed-parameter methods. The query is a single indexed lookup on product_id.
   */
  async getPriceHistory(productId: string): Promise<PriceHistory> {
    if (!isUuid(productId)) return { productId, points: [], p10: 0, median: 0, p90: 0 };
    const rows = await db
      .select({ ts: dealsTable.ts, price: dealsTable.price, store: dealsTable.store })
      .from(dealsTable)
      .where(and(eq(dealsTable.productId, productId), isNotNull(dealsTable.price)))
      .orderBy(asc(dealsTable.ts));

    const points: PricePoint[] = rows.map(r => ({
      ts: toIsoString(r.ts),
      price: Number(r.price),
      store: r.store,
    }));

    const sorted = points.map(p => p.price).sort((a, b) => a - b);

    return {
      productId,
      points,
      p10: Math.round(percentile(sorted, 0.1)),
      median: Math.round(percentile(sorted, 0.5)),
      p90: Math.round(percentile(sorted, 0.9)),
    };
  }
}

/**
 * Linear-interpolated percentile, matching SQL percentile_cont so the
 * single-product band lines up with the leaders table band.
 */
function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0] ?? 0;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[hi] ?? 0;
  if (lo === hi) return loVal;
  return loVal + (hiVal - loVal) * (idx - lo);
}
