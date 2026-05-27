import { sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';

export interface HeartbeatStats {
  totalDeals: number;
  dealsLast1h: number;
  dealsLast24h: number;
  dealsLast7d: number;
  lastDealAt: Date | null;
  oldestDealAt: Date | null;
  /** Deals where the resolver assigned a product_id. */
  resolvedDeals: number;
  /** Deals where AI extracted a product but the resolver gave up on linking it. */
  unresolvedDeals: number;
  /**
   * Share of resolvable deals (`product != null`) that ended up linked.
   * Rate over the subset that actually has a product — coupon-only and noise
   * deals are excluded from the denominator on purpose. 0..1.
   */
  resolutionRate: number;
}

/**
 * One-shot heartbeat: "is the pipeline alive and how busy has it been?".
 * Cheap: one indexed scan over `deals.ts`. All counters in a single round-trip.
 */
export default class HeartbeatService {
  async getStats(): Promise<HeartbeatStats> {
    const [row] = await db
      .select({
        total: sql<string>`COUNT(*)`,
        last1h: sql<string>`SUM(CASE WHEN ${dealsTable.ts} > NOW() - INTERVAL 1 HOUR THEN 1 ELSE 0 END)`,
        last24h: sql<string>`SUM(CASE WHEN ${dealsTable.ts} > NOW() - INTERVAL 1 DAY THEN 1 ELSE 0 END)`,
        last7d: sql<string>`SUM(CASE WHEN ${dealsTable.ts} > NOW() - INTERVAL 7 DAY THEN 1 ELSE 0 END)`,
        lastAt: sql<Date | null>`MAX(${dealsTable.ts})`,
        oldestAt: sql<Date | null>`MIN(${dealsTable.ts})`,
        resolved: sql<string>`
          SUM(CASE WHEN ${dealsTable.productId} IS NOT NULL THEN 1 ELSE 0 END)
        `,
        unresolved: sql<string>`
          SUM(CASE
            WHEN ${dealsTable.product} IS NOT NULL AND ${dealsTable.productId} IS NULL
            THEN 1 ELSE 0
          END)
        `,
      })
      .from(dealsTable);

    const resolved = row ? Number(row.resolved ?? 0) : 0;
    const unresolved = row ? Number(row.unresolved ?? 0) : 0;
    const resolvable = resolved + unresolved;

    return {
      totalDeals: row ? Number(row.total) : 0,
      dealsLast1h: row ? Number(row.last1h ?? 0) : 0,
      dealsLast24h: row ? Number(row.last24h ?? 0) : 0,
      dealsLast7d: row ? Number(row.last7d ?? 0) : 0,
      lastDealAt: row?.lastAt ?? null,
      oldestDealAt: row?.oldestAt ?? null,
      resolvedDeals: resolved,
      unresolvedDeals: unresolved,
      resolutionRate: resolvable === 0 ? 0 : resolved / resolvable,
    };
  }
}
