import type { PriceHistoryResponse } from '@bargah/shared';
import { and, desc, eq, gte, isNotNull, isNull, like, lt, or, sql } from 'drizzle-orm';
import type { Deal, NewDeal } from '~/db/schemas/deals';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productsTable } from '~/db/schemas/products';
import { isUuid } from '~/utils/ids';

export class DealService {
  /**
   * List all available stores for filtering
   */
  async getAvailableStores(orderByCount = true, sinceDays = 2): Promise<string[]> {
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
   * Create a new deal. Returns null when a deal for the same Telegram message
   * already exists (chat + message_id is unique) — e.g. a retried crawler POST
   * that raced the first one past the exists() check.
   */
  async create(data: NewDeal): Promise<Deal | null> {
    const [deal] = await db.insert(dealsTable)
      .values(data)
      .onConflictDoNothing({ target: [dealsTable.chat, dealsTable.messageId] })
      .returning();
    return deal ?? null;
  }

  /**
   * List deals ordered by timestamp (most recent first)
   */
  async findAll(limit = 32): Promise<Deal[]> {
    return db.select()
      .from(dealsTable)
      .orderBy(desc(dealsTable.ts))
      .limit(limit);
  }

  /**
   * Find deal by ID
   */
  async findById(id: number): Promise<Deal | null> {
    const [deal] = await db.select()
      .from(dealsTable)
      .where(eq(dealsTable.id, id));

    return deal ?? null;
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
   * Update local image path when download completes.
   *
   * Idempotent: only updates rows whose `local_path` is still null. This
   * protects coupon-only deals (which are created with `local_path = 'coupon.png'`)
   * from being overwritten by the late-arriving Telegram photo notification.
   */
  async updateImage(photoId: string, localPath: string): Promise<Deal | null> {
    const [deal] = await db.update(dealsTable)
      .set({ localPath })
      .where(and(
        eq(dealsTable.photoId, photoId),
        isNull(dealsTable.localPath),
      ))
      .returning();

    return deal ?? null;
  }

  /**
   * Find deals by chat channel
   */
  async findByChat(chat: string, limit = 100): Promise<Deal[]> {
    return db.select()
      .from(dealsTable)
      .where(eq(dealsTable.chat, chat))
      .orderBy(desc(dealsTable.ts))
      .limit(limit);
  }

  /**
   * Count total deals
   */
  async count(): Promise<number> {
    const [result] = await db.select({ count: sql<string>`COUNT(*)` })
      .from(dealsTable);

    return Number(result?.count || 0);
  }

  /**
   * List deals with cursor-based pagination
   */
  async findAllPaginated(limit: number, cursor?: Date): Promise<Deal[]> {
    return db.select()
      .from(dealsTable)
      .where(cursor ? lt(dealsTable.ts, cursor) : undefined)
      .orderBy(desc(dealsTable.ts))
      .limit(limit);
  }

  /**
   * List deals by chat with cursor-based pagination
   */
  async findByChatPaginated(chat: string, limit: number, cursor?: Date): Promise<Deal[]> {
    const conditions = cursor
      ? and(eq(dealsTable.chat, chat), lt(dealsTable.ts, cursor))
      : eq(dealsTable.chat, chat);

    return db.select()
      .from(dealsTable)
      .where(conditions)
      .orderBy(desc(dealsTable.ts))
      .limit(limit);
  }

  /**
   * Update deal links
   */
  async updateLinks(id: number, links: string[]): Promise<Deal | null> {
    const [deal] = await db.update(dealsTable)
      .set({ links })
      .where(eq(dealsTable.id, id))
      .returning();

    return deal ?? null;
  }

  /**
   * Update all extractor-produced fields at once (for reprocessing)
   */
  async updateExtracted(id: number, data: {
    text: string;
    description: string | null;
    product: string | null;
    store: string | null;
    price: number | null;
    coupons: Deal['coupons'];
    category: string | null;
  }): Promise<Deal | null> {
    const [deal] = await db.update(dealsTable)
      .set(data)
      .where(eq(dealsTable.id, id))
      .returning();

    return deal ?? null;
  }

  /**
   * Update deal's productId — written by the async product resolver after a deal is created.
   */
  async updateProductId(id: number, productId: string): Promise<void> {
    await db.update(dealsTable)
      .set({ productId })
      .where(eq(dealsTable.id, id));
  }

  /**
   * Price history for a canonical product, aggregated across every store that
   * sells it (mapped via `product_url_mappings`). The canonical name comes
   * from the `products` table so the response reflects the catalog's truth
   * rather than whatever any one deal text happened to say.
   */
  async getPriceHistory(productId: string): Promise<PriceHistoryResponse | null> {
    if (!isUuid(productId)) return null;
    const deals = await db.select({
      id: dealsTable.id,
      price: dealsTable.price,
      store: dealsTable.store,
      ts: dealsTable.ts,
      category: dealsTable.category,
      canonicalName: productsTable.canonicalName,
    })
      .from(dealsTable)
      .innerJoin(productsTable, eq(dealsTable.productId, productsTable.id))
      .where(
        and(
          eq(dealsTable.productId, productId),
          isNotNull(dealsTable.price),
        ),
      )
      .orderBy(desc(dealsTable.ts));

    if (deals.length === 0) {
      return null;
    }

    const prices = deals.map(d => d.price as number);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

    return {
      productId,
      canonicalName: deals[0]?.canonicalName ?? null,
      category: deals[0]?.category ?? null,
      history: deals.map(d => ({
        price: d.price as number,
        store: d.store,
        ts: d.ts.toISOString(),
        dealId: d.id,
      })),
      stats: {
        minPrice,
        maxPrice,
        avgPrice,
        totalDeals: deals.length,
      },
    };
  }

  /**
   * Find deals with advanced filters
   */
  async findWithFilters(params: {
    limit: number;
    cursor?: Date;
    from?: Date;
    to?: Date;
    search?: string;
    stores?: string[];
    hasCoupon?: boolean;
  }): Promise<Deal[]> {
    const conditions = [];

    if (params.cursor) {
      conditions.push(lt(dealsTable.ts, params.cursor));
    }

    if (params.from) {
      conditions.push(gte(dealsTable.ts, params.from));
    }

    if (params.to) {
      conditions.push(lt(dealsTable.ts, params.to));
    }

    // text/product/description/store use the case- and accent-insensitive
    // ci_ai collation, so a plain LIKE matches "café" against "CAFE".
    if (params.search) {
      const searchPattern = `%${params.search}%`;
      conditions.push(
        or(
          like(dealsTable.text, searchPattern),
          like(dealsTable.product, searchPattern),
          like(dealsTable.description, searchPattern),
          like(dealsTable.store, searchPattern),
        ),
      );
    }

    if (params.stores && params.stores.length > 0) {
      conditions.push(
        or(...params.stores.map(store => like(dealsTable.store, `%${store}%`))),
      );
    }

    if (params.hasCoupon !== undefined) {
      if (params.hasCoupon) {
        conditions.push(isNotNull(dealsTable.coupons));
      } else {
        conditions.push(isNull(dealsTable.coupons));
      }
    }

    return db.select()
      .from(dealsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dealsTable.ts))
      .limit(params.limit);
  }
}

export default DealService;
