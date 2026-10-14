/* eslint-disable no-console */
import 'dotenv/config';
import { inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productMatchDecisionsTable } from '~/db/schemas/product-match-decisions';
import { productsTable } from '~/db/schemas/products';
import { extractExternalIds } from '~/link-pipeline/identifiers/identifier-extractor';
import { buildIdentifierRegistry } from '~/link-pipeline/identifiers/registry';
import { logger } from '~/logger';

// ─────────────────────────────────────────────────────────────────────────────
//  split-overmerged-products
//
//  Fixes products that absorbed multiple distinct external IDs from the same
//  store. On specific-identifier sources (Amazon ASIN, Pichau slug, Terabyte
//  path), two different IDs = two different SKUs — the embedding resolver
//  merged them by mistake.
//
//  For each over-merged product the script:
//    1. Picks the "primary" external_id (most traceable deals; tiebreak: oldest
//       url_mapping entry, i.e. first in GROUP_CONCAT).
//    2. Creates a product clone for each "secondary" external_id.
//    3. Moves each secondary's url_mapping to its new product.
//    4. Reassigns deals by scanning deal.links + deal.text for explicit product
//       URLs. Deals with no traceable ID stay on the primary — they will be
//       re-resolved by `bun run backfill:products` after this script runs.
//
//  Dry-run by default. Pass `--commit` to apply changes.
//  After committing:
//    1. `bun run backfill:products`  — re-resolves untraced deals with fresh data.
//    2. `bun run audit:catalog`      — verifies the result.
//
//  Mercado Livre is intentionally excluded: multiple MLBs per canonical product
//  is expected behaviour (multi-seller platform), not an over-merge bug.
// ─────────────────────────────────────────────────────────────────────────────

const SOURCES_TO_FIX = ['amazon', 'terabyteshop.com.br', 'pichau'] as const;
type FixableSource = (typeof SOURCES_TO_FIX)[number];

// Matches any http/https URL in raw text so we can extract IDs from the full
// message body (the link may be in the text but not in the entity-layer links).
const URL_IN_TEXT_RE = /(https?:\/\/[^\s\n\]"'<>]+)/g;

interface ProductRow {
  id: string;
  canonicalName: string;
  category: string | null;
  modelKey: string | null;
  embedding: number[];
  embeddingModelVersion: string;
}

interface DealRow {
  id: number;
  links: string[];
  text: string;
}

interface SplitGroup {
  product: ProductRow;
  source: FixableSource;
  /** Keeps the original product record. */
  primaryId: string;
  /** Each entry here becomes a new product clone. */
  secondaryIds: string[];
  deals: DealRow[];
}

interface SplitResult {
  /** secondary external_id → new product UUID */
  newProducts: Map<string, string>;
  /** deal_id → secondary external_id it was assigned to */
  dealsAssigned: Map<number, string>;
  tracedToPrimary: number;
  untraced: number;
}

interface RunStats {
  sourcesProcessed: number;
  productsSplit: number;
  productsFailed: number;
  newProductsCreated: number;
  dealsReassigned: number;
  dealsUntraced: number;
}

class SplitOvermerged {
  private readonly registry = buildIdentifierRegistry();

  constructor(private readonly commit: boolean) {}

  async run(): Promise<void> {
    this.printHeader();
    const stats = await this.processAllSources();
    this.printSummary(stats);
  }

  // ── Orchestration ──────────────────────────────────────────────────────────

  private async processAllSources(): Promise<RunStats> {
    const stats: RunStats = {
      sourcesProcessed: 0,
      productsSplit: 0,
      productsFailed: 0,
      newProductsCreated: 0,
      dealsReassigned: 0,
      dealsUntraced: 0,
    };

    for (const source of SOURCES_TO_FIX) {
      sectionHeader(`SOURCE: ${source}`);
      stats.sourcesProcessed++;

      const groups = await this.buildSplitGroups(source);
      if (groups.length === 0) {
        console.log('  ✓ no over-merged products\n');
        continue;
      }

      console.log(`  ${groups.length} product(s) to split\n`);

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (!group) continue;
        this.printGroupHeader(i + 1, groups.length, group);

        if (!this.commit) {
          continue;
        }

        try {
          const result = await this.executeSplit(group);
          stats.productsSplit++;
          stats.newProductsCreated += result.newProducts.size;
          stats.dealsReassigned += result.dealsAssigned.size;
          stats.dealsUntraced += result.untraced;
          this.printSplitResult(result);
        } catch (err) {
          stats.productsFailed++;
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`      ✗ FAILED — ${msg}\n`);
        }
      }
    }

    return stats;
  }

  // ── Plan building ──────────────────────────────────────────────────────────

  private async buildSplitGroups(source: FixableSource): Promise<SplitGroup[]> {
    // Products with 2+ IDs from this source, oldest-first so GROUP_CONCAT order
    // is deterministic (primary candidate = first added when traces are tied).
    const overmergedRaw = await db.execute<{
      product_id: string;
      external_ids: string;
    }>(sql`
      SELECT product_id,
             GROUP_CONCAT(external_id ORDER BY created_at ASC SEPARATOR ',') AS external_ids
      FROM   product_url_mappings
      WHERE  source = ${source}
      GROUP  BY product_id
      HAVING COUNT(DISTINCT external_id) > 1
    `);

    const overmerged = readRows<{ product_id: string; external_ids: string }>(overmergedRaw);
    if (overmerged.length === 0) return [];

    const productIds = overmerged.map(r => r.product_id);

    const productRows = await db
      .select({
        id: productsTable.id,
        canonicalName: productsTable.canonicalName,
        category: productsTable.category,
        modelKey: productsTable.modelKey,
        embedding: productsTable.embedding,
        embeddingModelVersion: productsTable.embeddingModelVersion,
      })
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));

    const productMap = new Map(productRows.map(p => [p.id, p as ProductRow]));

    // Pull deals in chunks to avoid large IN() queries.
    const allDeals: { id: number; productId: string | null; links: unknown; text: string }[] = [];
    const CHUNK = 500;
    for (let i = 0; i < productIds.length; i += CHUNK) {
      const chunk = productIds.slice(i, i + CHUNK);
      const rows = await db
        .select({
          id: dealsTable.id,
          productId: dealsTable.productId,
          links: dealsTable.links,
          text: dealsTable.text,
        })
        .from(dealsTable)
        .where(inArray(dealsTable.productId, chunk));
      allDeals.push(...rows);
    }

    const dealsByProduct = new Map<string, DealRow[]>();
    for (const d of allDeals) {
      if (!d.productId) continue;
      const row: DealRow = {
        id: d.id,
        links: parseLinks(d.links),
        text: d.text,
      };
      const list = dealsByProduct.get(d.productId) ?? [];
      list.push(row);
      dealsByProduct.set(d.productId, list);
    }

    const groups: SplitGroup[] = [];

    for (const row of overmerged) {
      const product = productMap.get(row.product_id);
      if (!product) continue;

      const allIds = row.external_ids.split(',').filter(Boolean);
      const deals = dealsByProduct.get(row.product_id) ?? [];

      // Count how many deals can be traced to each external_id.
      const traceCount = new Map<string, number>(allIds.map(id => [id, 0]));
      for (const deal of deals) {
        for (const id of this.extractIdsForSource(deal, source)) {
          if (traceCount.has(id)) {
            traceCount.set(id, (traceCount.get(id) ?? 0) + 1);
          }
        }
      }

      // Primary = most traceable deals. Tiebreak: first in GROUP_CONCAT (oldest
      // url_mapping entry) — that ID was the one the product was originally built
      // around, so its existing deals are most likely correct.
      const ranked = allIds.slice().sort(
        (a, b) => (traceCount.get(b) ?? 0) - (traceCount.get(a) ?? 0),
      );
      const [primaryId, ...secondaryIds] = ranked;
      if (!primaryId || secondaryIds.length === 0) continue;

      groups.push({ product, source, primaryId, secondaryIds, deals });
    }

    return groups;
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  private async executeSplit(group: SplitGroup): Promise<SplitResult> {
    const { product, source, primaryId, secondaryIds, deals } = group;

    // Assign each deal to a secondary external_id if traceable, else primary.
    const dealsAssigned = new Map<number, string>(); // deal_id → secondary_id
    let tracedToPrimary = 0;
    let untraced = 0;

    for (const deal of deals) {
      const ids = this.extractIdsForSource(deal, source);
      const secondary = secondaryIds.find(sid => ids.includes(sid));
      if (secondary) {
        dealsAssigned.set(deal.id, secondary);
      } else if (ids.includes(primaryId)) {
        tracedToPrimary++;
      } else {
        untraced++;
      }
    }

    // Allocate new product IDs before entering the transaction.
    const newProducts = new Map<string, string>(
      secondaryIds.map(sid => [sid, randomUUID()]),
    );

    await db.transaction(async tx => {
      // Create a product clone for each secondary external_id.
      for (const [, newId] of newProducts) {
        await tx.insert(productsTable).values({
          id: newId,
          canonicalName: product.canonicalName,
          category: product.category,
          modelKey: product.modelKey,
          embedding: product.embedding,
          embeddingModelVersion: product.embeddingModelVersion,
        });
      }

      // Move each secondary url_mapping to its new product.
      for (const [sid, newId] of newProducts) {
        await tx.execute(sql`
          UPDATE product_url_mappings
          SET    product_id = ${newId}
          WHERE  source      = ${source}
          AND    external_id = ${sid}
        `);
      }

      // Reassign deals (and decisions) that were traced to a secondary ID.
      for (const [sid, newId] of newProducts) {
        const dealIdsForThis = [...dealsAssigned.entries()]
          .filter(([, assignedSid]) => assignedSid === sid)
          .map(([dealId]) => dealId);

        if (dealIdsForThis.length === 0) continue;

        const CHUNK = 500;
        for (let i = 0; i < dealIdsForThis.length; i += CHUNK) {
          const batch = dealIdsForThis.slice(i, i + CHUNK);

          await tx
            .update(dealsTable)
            .set({ productId: newId })
            .where(inArray(dealsTable.id, batch));

          await tx
            .update(productMatchDecisionsTable)
            .set({ productId: newId })
            .where(inArray(productMatchDecisionsTable.dealId, batch));
        }
      }
    });

    return { newProducts, dealsAssigned, tracedToPrimary, untraced };
  }

  // ── ID extraction ─────────────────────────────────────────────────────────

  /**
   * Extracts all external IDs for `source` from a deal, scanning both the
   * stored links array and every URL found in the raw deal text.
   *
   * The text scan is critical: Telegram often includes the full product URL in
   * the message body even when the entity-layer link is a shortener. Deals that
   * came through shorteners that have already expired are still handled as long
   * as the canonical URL appeared in the original text.
   */
  private extractIdsForSource(deal: DealRow, source: string): string[] {
    const candidates: string[] = [...deal.links];

    for (const match of deal.text.matchAll(URL_IN_TEXT_RE)) {
      const url = match[1];
      if (url) candidates.push(url);
    }

    return extractExternalIds(candidates, this.registry)
      .filter(id => id.source === source)
      .map(id => id.externalId);
  }

  // ── Output ─────────────────────────────────────────────────────────────────

  private printHeader(): void {
    const mode = this.commit ? '\x1b[31mCOMMIT\x1b[0m' : '\x1b[33mDRY RUN\x1b[0m';
    console.log();
    console.log('═════════════════════════════════════════════════════════════════');
    console.log(`  split-overmerged-products — mode: ${mode}`);
    if (!this.commit) {
      console.log('  (no DB mutations. Pass `--commit` to actually apply changes.)');
    }
    console.log('  New product clones inherit the parent canonical_name temporarily.');
    console.log('  After committing, run backfill:products to re-resolve untraced');
    console.log('  deals with fresh embeddings/judge calls.');
    console.log('═════════════════════════════════════════════════════════════════');
    console.log();
  }

  private printGroupHeader(i: number, total: number, group: SplitGroup): void {
    const { product, source, primaryId, secondaryIds, deals } = group;
    console.log(`  [${i}/${total}] "${truncate(product.canonicalName, 58)}"`);
    console.log(`        primary id:   ${source}:${truncate(primaryId, 36)}`);
    for (const sid of secondaryIds) {
      console.log(`        split off:    ${source}:${truncate(sid, 36)} → NEW product`);
    }
    console.log(`        total deals:  ${deals.length}`);
  }

  private printSplitResult(result: SplitResult): void {
    const { newProducts, dealsAssigned, tracedToPrimary, untraced } = result;
    console.log(`        ✓ products created:   ${newProducts.size}`);
    console.log(`          deals → new:        ${dealsAssigned.size}`);
    console.log(`          deals → primary:    ${tracedToPrimary}`);
    console.log(`          deals untraced:     ${untraced}${untraced > 0 ? ' (run backfill:products)' : ''}`);
    console.log();
  }

  private printSummary(stats: RunStats): void {
    sectionHeader('SUMMARY');
    if (!this.commit) {
      console.log('  DRY RUN — no changes applied.');
      console.log('  Run with `--commit` to see the full count and apply changes.');
    } else {
      console.log(`  products split:          ${stats.productsSplit}`);
      console.log(`  products failed:         ${stats.productsFailed}`);
      console.log(`  new products created:    ${stats.newProductsCreated}`);
      console.log(`  deals reassigned:        ${stats.dealsReassigned}`);
      console.log(`  deals untraced:          ${stats.dealsUntraced}`);
    }
    console.log();
    console.log('  Next steps:');
    if (this.commit) {
      console.log('    1. bun run backfill:products  — re-resolves untraced deals');
      console.log('    2. bun run audit:catalog      — verifies the result');
    } else {
      console.log('    Re-run with `--commit` to apply.');
    }
    console.log();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sectionHeader(title: string): void {
  const bar = '═'.repeat(65);
  console.log(bar);
  console.log(`  ${title}`);
  console.log(bar);
  console.log();
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function parseLinks(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]);
  }
  return [];
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const commit = process.argv.includes('--commit');

new SplitOvermerged(commit)
  .run()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Split aborted', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });
