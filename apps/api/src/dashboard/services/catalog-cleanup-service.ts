import type { AnalyzedDeal, Anomaly, CleanResult, DealVerdict, ProductAnalysis } from '@bargah/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productUrlMappingsTable } from '~/db/schemas/product-url-mappings';
import { productsTable } from '~/db/schemas/products';
import { extractExternalIds } from '~/link-pipeline/identifiers/identifier-extractor';
import { buildIdentifierRegistry } from '~/link-pipeline/identifiers/registry';
import { sharedTokenCount } from '~/products/utils/product-name-tokens';
import { specsConflict } from '~/products/utils/spec-conflict';
import { isUuid } from '~/utils/ids';
import { createTtlCache } from '../cache';

const URL_IN_TEXT_RE = /(https?:\/\/[^\s\n\]"'<>]+)/g;

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
        -- Cheap pre-filter: a product can only have p90/p10 > N if MAX/MIN > N
        -- (since p90 <= max and p10 >= min). This shrinks the set the percentile
        -- aggregates run over from "all products" to just the spread suspects —
        -- without dropping any true anomaly.
        HAVING COUNT(*) >= ${minDeals}
           AND MAX(price) > MIN(price) * ${SUSPECT_SPREAD_RATIO}
      ),
      bands AS (
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
      )
      SELECT product_id, canonical_name, category, deals, p10, med, p90
      FROM bands
      WHERE p10 > 0 AND (p90 / p10) > ${SUSPECT_SPREAD_RATIO}
      ORDER BY (p90 / p10) DESC
      LIMIT ${limit}
    `);

    return rows.map(r => {
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
    if (!isUuid(productId)) return null;
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
    if (!isUuid(productId)) return { unlinked: 0 };
    if (dealIds.length === 0) return { unlinked: 0 };

    // 1. Fetch the links + text of the deals being unlinked so we can extract
    //    any catalog IDs (ASINs, Terabyte IDs, …) they carry. Those IDs have
    //    url_mapping entries pointing to THIS product — without removing them
    //    the next backfill will url_anchor-match the deals right back here.
    const dealRows = await db
      .select({ id: dealsTable.id, links: dealsTable.links, text: dealsTable.text })
      .from(dealsTable)
      .where(inArray(dealsTable.id, dealIds));

    const registry = buildIdentifierRegistry();
    const toDeleteMappings: { source: string; externalId: string }[] = [];

    for (const row of dealRows) {
      const links = parseLinks(row.links);
      const urlsInText = [...row.text.matchAll(URL_IN_TEXT_RE)].map(m => m[1] as string);
      const ids = extractExternalIds([...links, ...urlsInText], registry);
      for (const id of ids) {
        toDeleteMappings.push({ source: id.source, externalId: id.externalId });
      }
    }

    // 2. Delete the url_mappings that would cause re-linking. Scoped to THIS
    //    product so mappings for the same IDs on other products are untouched.
    if (toDeleteMappings.length > 0) {
      const unique = [...new Map(
        toDeleteMappings.map(m => [`${m.source}:${m.externalId}`, m]),
      ).values()];

      const CHUNK = 50;
      for (let i = 0; i < unique.length; i += CHUNK) {
        const batch = unique.slice(i, i + CHUNK);
        await db.delete(productUrlMappingsTable).where(
          and(
            eq(productUrlMappingsTable.productId, productId),
            sql.join(
              batch.map(m => sql`(
                ${productUrlMappingsTable.source} = ${m.source}
                AND ${productUrlMappingsTable.externalId} = ${m.externalId}
              )`),
              sql` OR `,
            ),
          ),
        );
      }
    }

    // 3. Unlink the deals.
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
        ))
        .returning({ id: dealsTable.id });
      unlinked += result.length;
    }

    return { unlinked };
  }

  /** Renames a product's canonical name (curation after over-merge splits). */
  async updateProductName(productId: string, canonicalName: string): Promise<{ ok: boolean }> {
    if (!isUuid(productId)) return { ok: false };
    const updated = await db
      .update(productsTable)
      .set({ canonicalName })
      .where(eq(productsTable.id, productId))
      .returning({ id: productsTable.id });
    return { ok: updated.length > 0 };
  }

  /** Clears the anomalies cache. Called on modal close so the queue recomputes. */
  invalidateCaches(): void {
    this.anomaliesCache.invalidate();
  }

  /**
   * Corrects a deal's extracted fields. Either or both of `price` (cents) and
   * `product` (AI-extracted name) can be updated in one round-trip. The raw
   * `deals.text` is left untouched as the source of truth.
   */
  async updateDeal(
    dealId: number,
    fields: { price?: number; product?: string },
  ): Promise<{ ok: boolean }> {
    const update: Partial<{ price: number; product: string }> = {};
    if (fields.price !== undefined) update.price = fields.price;
    if (fields.product !== undefined) update.product = fields.product;
    if (Object.keys(update).length === 0) return { ok: false };

    const updated = await db
      .update(dealsTable)
      .set(update)
      .where(eq(dealsTable.id, dealId))
      .returning({ id: dealsTable.id });

    return { ok: updated.length > 0 };
  }

  /**
   * Hard-deletes a junk deal. Its match-decision rows go with it
   * (product_match_decisions.deal_id is ON DELETE CASCADE).
   */
  async deleteDeal(dealId: number): Promise<{ ok: boolean }> {
    const deleted = await db
      .delete(dealsTable)
      .where(eq(dealsTable.id, dealId))
      .returning({ id: dealsTable.id });

    // Keep interactive deletes snappy; the queue refreshes when the modal closes.
    return { ok: deleted.length > 0 };
  }
}

function parseLinks(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as string[]; } catch { return []; }
  }
  return [];
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

