import type {
  ExplorerProduct,
  ExplorerSortField,
  ProductDetail,
  ProductPage,
  ProductSource,
  SortOrder,
  TimelineEvent,
} from '@bargah/shared';
import { eq, sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productUrlMappingsTable } from '~/db/schemas/product-url-mappings';
import { productsTable } from '~/db/schemas/products';
import { isoTimestamp } from '~/db/sql';
import { toIsoString } from '~/utils/dates';
import { isUuid } from '~/utils/ids';

// Whitelisted ORDER BY expressions (sort comes from a validated enum).
const SORT_SQL: Record<ExplorerSortField, string> = {
  deals: 'deals',
  p10: 'p10',
  median: 'median',
  spread: 'spread_ratio',
  created_at: 'created_at',
};

export default class ProductExplorerService {
  async search(params: {
    q: string;
    category: string;
    sort: ExplorerSortField;
    order: SortOrder;
    page: number;
    limit: number;
  }): Promise<ProductPage> {
    const { q, category, sort, order, page, limit } = params;
    const offset = (page - 1) * limit;

    // The LIKE wildcard is added server-side; the value itself is a bound parameter.
    // canonical_name and category are case/accent-insensitive (ci_ai).
    const pattern = `%${q}%`;
    const filter = sql`p.canonical_name LIKE ${pattern} ${category ? sql`AND p.category = ${category}` : sql``}`;

    const [countRow] = await db.execute<{ total: string }>(sql`
      SELECT COUNT(*) AS total FROM products p WHERE ${filter}
    `);
    const total = Number(countRow?.total ?? 0);
    const pages = Math.max(1, Math.ceil(total / limit));

    if (total === 0) {
      return { items: [], total: 0, page, pages: 1 };
    }

    // Deal count and price band per product, so the page can be sorted by any of
    // them. Products without priced deals have NULL percentiles and sort last.
    const rows = await db.execute<{
      id: string;
      canonical_name: string;
      category: string | null;
      created_at: string;
      deals: string;
      p10: string | null;
      median: string | null;
      p90: string | null;
    }>(sql`
      WITH stats AS (
        SELECT
          p.id,
          p.canonical_name,
          p.category,
          p.created_at,
          COUNT(d.id) AS deals,
          round(percentile_cont(0.1) WITHIN GROUP (ORDER BY d.price)) AS p10,
          round(percentile_cont(0.5) WITHIN GROUP (ORDER BY d.price)) AS median,
          round(percentile_cont(0.9) WITHIN GROUP (ORDER BY d.price)) AS p90
        FROM products p
        LEFT JOIN deals d ON d.product_id = p.id AND d.price IS NOT NULL
        WHERE ${filter}
        GROUP BY p.id
      )
      SELECT
        id, canonical_name, category, deals, p10, median, p90,
        ${isoTimestamp(sql`created_at`)} AS created_at,
        p90 / NULLIF(p10, 0) AS spread_ratio
      FROM stats
      ORDER BY ${sql.raw(SORT_SQL[sort])} ${sql.raw(order === 'asc' ? 'ASC' : 'DESC')} NULLS LAST, id ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const items: ExplorerProduct[] = rows.map(r => {
      const p10 = r.p10 !== null ? Number(r.p10) : null;
      const p90 = r.p90 !== null ? Number(r.p90) : null;
      const spreadRatio = p10 && p90 && p10 > 0 ? Number((p90 / p10).toFixed(2)) : null;

      return {
        id: r.id,
        canonicalName: r.canonical_name,
        category: r.category,
        deals: Number(r.deals),
        p10,
        median: r.median !== null ? Number(r.median) : null,
        p90,
        spreadRatio,
        createdAt: r.created_at,
      };
    });

    return { items, total, page, pages };
  }

  async getProductDetail(productId: string): Promise<ProductDetail | null> {
    if (!isUuid(productId)) return null;
    const [product] = await db
      .select({
        id: productsTable.id,
        canonicalName: productsTable.canonicalName,
        category: productsTable.category,
        createdAt: productsTable.createdAt,
      })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) return null;

    const [dealRows, sourceRows] = await Promise.all([
      db
        .select({
          id: dealsTable.id,
          ts: dealsTable.ts,
          price: dealsTable.price,
          store: dealsTable.store,
          chat: dealsTable.chat,
          description: dealsTable.description,
          coupons: dealsTable.coupons,
        })
        .from(dealsTable)
        .where(eq(dealsTable.productId, productId))
        .orderBy(sql`${dealsTable.ts} DESC`),

      db
        .select({
          source: productUrlMappingsTable.source,
          externalId: productUrlMappingsTable.externalId,
          createdAt: productUrlMappingsTable.createdAt,
        })
        .from(productUrlMappingsTable)
        .where(eq(productUrlMappingsTable.productId, productId))
        .orderBy(productUrlMappingsTable.createdAt),
    ]);

    const pricedDeals = dealRows.filter(d => d.price !== null);

    // Compute percentiles in JS — no extra DB round-trip.
    const sorted = pricedDeals.map(d => Number(d.price)).sort((a, b) => a - b);
    const p10 = Math.round(pctile(sorted, 0.1));
    const median = Math.round(pctile(sorted, 0.5));
    const p90 = Math.round(pctile(sorted, 0.9));

    const minPrice = sorted[0] ?? 0;

    const events: TimelineEvent[] = dealRows.map(d => ({
      dealId: d.id,
      ts: d.ts instanceof Date ? d.ts.toISOString() : String(d.ts),
      price: Number(d.price ?? 0),
      store: d.store,
      chat: d.chat,
      description: d.description,
      coupons: parseCoupons(d.coupons),
      isFloor: d.price !== null && Number(d.price) === minPrice,
    }));

    const sources: ProductSource[] = sourceRows.map(s => ({
      source: s.source,
      externalId: s.externalId,
      createdAt: toIsoString(s.createdAt),
    }));

    return {
      id: product.id,
      canonicalName: product.canonicalName,
      category: product.category,
      createdAt: toIsoString(product.createdAt),
      events,
      sources,
      p10,
      median,
      p90,
    };
  }
}

function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const loVal = sorted[lo] ?? 0;
  const hiVal = sorted[hi] ?? 0;
  return lo === hi ? loVal : loVal + (hiVal - loVal) * (idx - lo);
}

function parseCoupons(raw: unknown): { code: string; discount?: string }[] | null {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed as { code: string; discount?: string }[] : null;
  } catch {
    return null;
  }
}
