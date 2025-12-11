import { and, desc, eq, gte, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import type { Deal, NewDeal } from '~/db/schemas/deals';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';

export class DealService {
  /**
   * Parse JSON fields that may come as string from MySQL
   */
  private parseDeal(deal: Deal): Deal {
    return {
      ...deal,
      links: typeof deal.links === 'string' ? JSON.parse(deal.links) : deal.links,
      coupons: deal.coupons && typeof deal.coupons === 'string' ? JSON.parse(deal.coupons) : deal.coupons,
    };
  }

  /**
   * List all available stores for filtering
   */
  async getAvailableStores(orderByCount = true, sinceDays = 3): Promise<string[]> {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - sinceDays);

    if (orderByCount) {
      const result = await db.select({
        store: dealsTable.store,
        count: sql`COUNT(${dealsTable.store})`.as('count'),
      })
        .from(dealsTable)
        .where(and(
          isNotNull(dealsTable.store),
          gte(dealsTable.ts, sinceDate),
        ))
        .groupBy(dealsTable.store)
        .orderBy(desc(sql`count`));

      return result
        .map(row => row.store as string)
        .filter(Boolean);
    }

    const result = await db.select({ store: dealsTable.store })
      .from(dealsTable)
      .where(and(
        isNotNull(dealsTable.store),
        gte(dealsTable.ts, sinceDate),
      ))
      .groupBy(dealsTable.store)
      .orderBy(dealsTable.store);

    return result
      .map(row => row.store as string)
      .filter(Boolean);
  }

  /**
   * Create a new deal
   */
  async create(data: NewDeal): Promise<Deal> {
    const [result] = await db.insert(dealsTable).values(data);
    const insertId = Number(result.insertId);

    const [deal] = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.id, insertId));

    return this.parseDeal(deal);
  }

  /**
   * List deals ordered by timestamp (most recent first)
   */
  async findAll(limit = 32): Promise<Deal[]> {
    const deals = await db.select()
      .from(dealsTable)
      .orderBy(desc(dealsTable.ts))
      .limit(limit);

    return deals.map(deal => this.parseDeal(deal));
  }

  /**
   * Find deal by ID
   */
  async findById(id: number): Promise<Deal | null> {
    const [deal] = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.id, id));

    return deal ? this.parseDeal(deal) : null;
  }

  /**
   * Check if deal already exists (deduplication)
   */
  async exists(chat: string, messageId: number): Promise<boolean> {
    const [deal] = await db.select({ id: dealsTable.id })
      .from(dealsTable)
      .where(
        and(
          eq(dealsTable.chat, chat),
          eq(dealsTable.messageId, messageId),
        ),
      )
      .limit(1);

    return !!deal;
  }

  /**
   * Update local image path when download completes
   */
  async updateImage(photoId: string, localPath: string): Promise<Deal | null> {
    const result = await db.update(dealsTable)
      .set({ localPath })
      .where(eq(dealsTable.photoId, photoId));

    if (result[0].affectedRows === 0) {
      return null;
    }

    const [deal] = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.photoId, photoId));

    return deal ? this.parseDeal(deal) : null;
  }

  /**
   * Find deals by chat channel
   */
  async findByChat(chat: string, limit = 100): Promise<Deal[]> {
    const deals = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.chat, chat))
      .orderBy(desc(dealsTable.ts))
      .limit(limit);

    return deals.map(deal => this.parseDeal(deal));
  }

  /**
   * Count total deals
   */
  async count(): Promise<number> {
    const [result] = await db.select({ count: dealsTable.id })
      .from(dealsTable);

    return Number(result?.count || 0);
  }

  /**
   * List deals with cursor-based pagination
   */
  async findAllPaginated(limit: number, cursor?: Date): Promise<Deal[]> {
    const query = db.select()
      .from(dealsTable)
      .orderBy(desc(dealsTable.ts))
      .limit(limit);

    if (cursor) {
      query.where(lt(dealsTable.ts, cursor));
    }

    const deals = await query;
    return deals.map(deal => this.parseDeal(deal));
  }

  /**
   * List deals by chat with cursor-based pagination
   */
  async findByChatPaginated(chat: string, limit: number, cursor?: Date): Promise<Deal[]> {
    const conditions = cursor
      ? and(eq(dealsTable.chat, chat), lt(dealsTable.ts, cursor))
      : eq(dealsTable.chat, chat);

    const deals = await db.select()
      .from(dealsTable)
      .where(conditions)
      .orderBy(desc(dealsTable.ts))
      .limit(limit);

    return deals.map(deal => this.parseDeal(deal));
  }

  /**
   * Update deal links
   */
  async updateLinks(id: number, links: string[]): Promise<Deal | null> {
    const result = await db.update(dealsTable)
      .set({ links })
      .where(eq(dealsTable.id, id));

    if (result[0].affectedRows === 0) {
      return null;
    }

    const [deal] = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.id, id));

    return deal ? this.parseDeal(deal) : null;
  }

  /**
   * Find deals with advanced filters
   */
  async findWithFilters(params: {
    limit: number;
    cursor?: Date;
    search?: string;
    stores?: string[];
    hasCoupon?: boolean;
  }): Promise<Deal[]> {
    const conditions = [];

    if (params.cursor) {
      conditions.push(lt(dealsTable.ts, params.cursor));
    }

    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(
        or(
          sql`${dealsTable.text} LIKE ${searchPattern} COLLATE utf8mb4_unicode_ci`,
          sql`${dealsTable.product} LIKE ${searchPattern} COLLATE utf8mb4_unicode_ci`,
          sql`${dealsTable.description} LIKE ${searchPattern} COLLATE utf8mb4_unicode_ci`,
          sql`${dealsTable.store} LIKE ${searchPattern} COLLATE utf8mb4_unicode_ci`,
        ),
      );
    }

    if (params.stores && params.stores.length > 0) {
      conditions.push(
        or(...params.stores.map(store =>
          sql`${dealsTable.store} LIKE ${`%${store}%`} COLLATE utf8mb4_unicode_ci`,
        )),
      );
    }

    if (params.hasCoupon !== undefined) {
      if (params.hasCoupon) {
        conditions.push(isNotNull(dealsTable.coupons));
      } else {
        conditions.push(isNull(dealsTable.coupons));
      }
    }

    const deals = await db.select()
      .from(dealsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dealsTable.ts))
      .limit(params.limit);

    return deals.map(deal => this.parseDeal(deal));
  }
}

export default DealService;
