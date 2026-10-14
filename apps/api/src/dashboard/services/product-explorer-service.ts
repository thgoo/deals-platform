import { eq, sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productUrlMappingsTable } from '~/db/schemas/product-url-mappings';
import { productsTable } from '~/db/schemas/products';

export type ExplorerSortField = 'deals' | 'p10' | 'median' | 'spread' | 'created_at';
export type SortOrder = 'asc' | 'desc';

export interface ProductRow {
  id: string;
  canonicalName: string;
  category: string | null;
  deals: number;
  p10: number | null;
  median: number | null;
  p90: number | null;
  spreadRatio: number | null;
  createdAt: Date;
}

export interface ProductPage {
  items: ProductRow[];
  total: number;
  page: number;
  pages: number;
}

export interface TimelineEvent {
  dealId: number;
  ts: string;
  price: number;
  store: string | null;
  chat: string | null;
  description: string | null;
  coupons: { code: string; discount?: string }[] | null;
  /** True when this deal is the all-time price floor for the product. */
  isFloor: boolean;
}

export interface ProductSource {
  source: string;
  externalId: string;
  createdAt: string;
}

export interface ProductDetail {
  id: string;
  canonicalName: string;
  category: string | null;
  createdAt: string;
  events: TimelineEvent[];  // newest first
  sources: ProductSource[];
  p10: number;
  median: number;
  p90: number;
}

interface PercRow {
  product_id: string;
  p10: number | string | null;
  med: number | string | null;
  p90: number | string | null;
}

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

    // Pattern is sanitised (no user-controlled interpolation) — the LIKE
    // wildcard is added server-side; the value itself is a bound parameter.
    const pattern = `%${q}%`;

    const countRows = await db.execute<{ total: number | string }>(sql`
      SELECT COUNT(*) AS total
      FROM products p
      WHERE p.canonical_name LIKE ${pattern}
        ${category ? sql`AND p.category = ${category}` : sql``}
    `);
    const total = Number(readScalar(countRows, 'total') ?? 0);
    const pages = Math.max(1, Math.ceil(total / limit));

    if (total === 0) {
      return { items: [], total: 0, page, pages: 1 };
    }

    // Step 1: resolve the page's product IDs cheaply (no window functions).
    const idsRows = await db.execute<{ id: string; deals: number | string; created_at: Date }>(sql`
      SELECT p.id, COUNT(d.id) AS deals, p.created_at
      FROM products p
      LEFT JOIN deals d ON d.product_id = p.id AND d.price IS NOT NULL
      WHERE p.canonical_name LIKE ${pattern}
        ${category ? sql`AND p.category = ${category}` : sql``}
      GROUP BY p.id, p.created_at
      ORDER BY ${sql.raw(SORT_SQL[sort])} ${sql.raw(order.toUpperCase())}, p.id ASC
      LIMIT ${sql.raw(String(limit))} OFFSET ${sql.raw(String(offset))}
    `);

    const pageIds = readRows<{ id: string; deals: number | string; created_at: Date }>(idsRows);
    if (pageIds.length === 0) {
      return { items: [], total, page, pages };
    }

    const idList = pageIds.map(r => r.id);
    const dealCountMap = new Map(pageIds.map(r => [r.id, Number(r.deals)]));
    const createdAtMap = new Map(pageIds.map(r => [r.id, r.created_at]));

    // Step 2: names + categories.
    const productRows = await db
      .select({
        id: productsTable.id,
        canonicalName: productsTable.canonicalName,
        category: productsTable.category,
      })
      .from(productsTable)
      .where(sql`${productsTable.id} IN (${sql.join(idList.map(id => sql`${id}`), sql`, `)})`);

    const productMeta = new Map(productRows.map(p => [p.id, p]));

    // Step 3: percentiles, but ONLY for this page's products.
    const percRows = await db.execute<{
      product_id: string;
      p10: number | string | null;
      med: number | string | null;
      p90: number | string | null;
    }>(sql`
      SELECT product_id, p10, med, p90 FROM (
        SELECT DISTINCT
          p.id AS product_id,
          ROUND(PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY d.price) OVER (PARTITION BY p.id)) AS p10,
          ROUND(MEDIAN(d.price)      OVER (PARTITION BY p.id))                                 AS med,
          ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY d.price) OVER (PARTITION BY p.id)) AS p90
        FROM products p
        JOIN deals d ON d.product_id = p.id AND d.price IS NOT NULL
        WHERE p.id IN (${sql.join(idList.map(id => sql`${id}`), sql`, `)})
      ) t
    `);

    const percMap = new Map(
      readRows<PercRow>(percRows).map(r => [r.product_id, r]),
    );

    // Assemble in the order the IDs page gave us.
    const items: ProductRow[] = idList.map(id => {
      const meta = productMeta.get(id);
      const perc = percMap.get(id);
      const p10 = perc?.p10 != null ? Number(perc.p10) : null;
      const p90 = perc?.p90 != null ? Number(perc.p90) : null;
      const spreadRatio = p10 && p90 && p10 > 0 ? Number((p90 / p10).toFixed(2)) : null;

      return {
        id,
        canonicalName: meta?.canonicalName ?? '',
        category: meta?.category ?? null,
        deals: dealCountMap.get(id) ?? 0,
        p10,
        median: perc?.med != null ? Number(perc.med) : null,
        p90,
        spreadRatio,
        createdAt: createdAtMap.get(id) ?? new Date(0),
      };
    });

    return { items, total, page, pages };
  }

  async getProductDetail(productId: string): Promise<ProductDetail | null> {
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
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
    }));

    return {
      id: product.id,
      canonicalName: product.canonicalName,
      category: product.category,
      createdAt: product.createdAt instanceof Date
        ? product.createdAt.toISOString()
        : String(product.createdAt),
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
