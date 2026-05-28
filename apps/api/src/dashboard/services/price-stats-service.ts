import { sql } from 'drizzle-orm';
import db from '~/db';
import { createTtlCache } from '../cache';

export interface PriceLeader {
  productId: string;
  canonicalName: string;
  category: string | null;
  deals: number;
  /** 10th percentile price in cents — robust "floor" (drops low outliers). */
  p10: number;
  /** Median price in cents. */
  median: number;
  /** 90th percentile price in cents — robust "ceiling" (drops high outliers). */
  p90: number;
  /** p90 / p10. Near 1 = stable price; high = wide swing or contaminated. */
  spreadRatio: number;
  /**
   * True when the spread is implausibly wide. A single threshold cleanly
   * separates clean price series (ratio ~1.2-2) from variant-collapse /
   * mis-extraction (ratio >> 3, e.g. a polo shirt matched into "iPhone 16").
   */
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
  /** Percentiles in cents, computed over the returned points. */
  p10: number;
  median: number;
  p90: number;
}

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

  private async computePriceLeaders(limit: number, minDeals: number): Promise<PriceLeader[]> {
    // Pre-filter to eligible products with a cheap GROUP BY before the window
    // pass — running PERCENTILE_CONT over the full deals table is O(rows) and
    // costs minutes; restricting to products with enough deals keeps it ~2s.
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
      SELECT id AS product_id, canonical_name, category, deals, p10, med, p90
      FROM (
        SELECT DISTINCT
          p.id              AS id,
          p.canonical_name  AS canonical_name,
          p.category        AS category,
          COUNT(d.id)          OVER (PARTITION BY p.id)                          AS deals,
          ROUND(PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY d.price) OVER (PARTITION BY p.id)) AS p10,
          ROUND(MEDIAN(d.price)      OVER (PARTITION BY p.id))                   AS med,
          ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY d.price) OVER (PARTITION BY p.id)) AS p90
        FROM products p
        JOIN deals d    ON d.product_id = p.id
        JOIN eligible e ON e.product_id = p.id
        WHERE d.price IS NOT NULL
      ) t
      ORDER BY deals DESC
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
    const rows = await db.execute<{ ts: Date | string; price: number | string; store: string | null }>(sql`
      SELECT ts, price, store
      FROM deals
      WHERE product_id = ${productId} AND price IS NOT NULL
      ORDER BY ts ASC
    `);

    const points: PricePoint[] = readRows<{ ts: Date | string; price: number | string; store: string | null }>(rows)
      .map(r => ({
        ts: typeof r.ts === 'string' ? r.ts : r.ts.toISOString(),
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
 * Linear-interpolated percentile, matching MariaDB's PERCENTILE_CONT so the
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

// mysql2 may return either a plain rows array or `{ rows, fields }` depending on
// the call. Normalize once at the boundary (same shape as catalog-stats-service).
function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]);
  }
  return [];
}
