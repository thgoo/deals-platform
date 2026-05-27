import { and, desc, gte, isNotNull, sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { createTtlCache } from '../cache';

export interface NamedCount {
  name: string;
  count: number;
}

export interface DailyCount {
  day: string;
  count: number;
}

// Business aggregates change slowly relative to a 60s refresh; cache freely.
const BUSINESS_TTL_MS = 60_000;

/**
 * Aggregations for the "business" lens of the dashboard — top stores,
 * categories, and the deal-volume time series. Read-only.
 */
export default class BusinessStatsService {
  private storesCache = createTtlCache<NamedCount[]>(BUSINESS_TTL_MS);
  private categoriesCache = createTtlCache<NamedCount[]>(BUSINESS_TTL_MS);
  private timeSeriesCache = createTtlCache<DailyCount[]>(BUSINESS_TTL_MS);

  async getTopStores(days: number, limit: number): Promise<NamedCount[]> {
    return this.storesCache.get(() => this.computeTopStores(days, limit));
  }

  private async computeTopStores(days: number, limit: number): Promise<NamedCount[]> {
    const since = daysAgo(days);
    const rows = await db
      .select({
        name: dealsTable.store,
        count: sql<string>`COUNT(*)`,
      })
      .from(dealsTable)
      .where(and(isNotNull(dealsTable.store), gte(dealsTable.ts, since)))
      .groupBy(dealsTable.store)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit);

    return rows
      .filter(r => r.name !== null)
      .map(r => ({ name: r.name as string, count: Number(r.count) }));
  }

  async getTopCategories(days: number, limit: number): Promise<NamedCount[]> {
    return this.categoriesCache.get(() => this.computeTopCategories(days, limit));
  }

  private async computeTopCategories(days: number, limit: number): Promise<NamedCount[]> {
    const since = daysAgo(days);
    const rows = await db
      .select({
        name: dealsTable.category,
        count: sql<string>`COUNT(*)`,
      })
      .from(dealsTable)
      .where(and(isNotNull(dealsTable.category), gte(dealsTable.ts, since)))
      .groupBy(dealsTable.category)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(limit);

    return rows
      .filter(r => r.name !== null)
      .map(r => ({ name: r.name as string, count: Number(r.count) }));
  }

  async getDealsTimeSeries(days: number): Promise<DailyCount[]> {
    return this.timeSeriesCache.get(() => this.computeDealsTimeSeries(days));
  }

  private async computeDealsTimeSeries(days: number): Promise<DailyCount[]> {
    const rows = await db.execute<{ day: string; count: number | string }>(sql`
      SELECT DATE(ts) AS day, COUNT(*) AS count
      FROM deals
      WHERE ts > NOW() - INTERVAL ${sql.raw(String(days))} DAY
      GROUP BY DATE(ts)
      ORDER BY day ASC
    `);

    const list = Array.isArray(rows) && Array.isArray(rows[0])
      ? (rows[0] as { day: string | Date; count: number | string }[])
      : (rows as unknown as { day: string | Date; count: number | string }[]);

    return list.map(r => ({
      day: typeof r.day === 'string' ? r.day : r.day.toISOString().slice(0, 10),
      count: Number(r.count),
    }));
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
