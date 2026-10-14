/* eslint-disable no-console */
import 'dotenv/config';
import { inArray, sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productsTable } from '~/db/schemas/products';
import { logger } from '~/logger';

// ─────────────────────────────────────────────────────────────────────────────
//  unlink-outlier-deals
//
//  Finds deals whose price is an extreme outlier relative to the median price
//  of their linked product AND whose AI-extracted product name shares no
//  meaningful tokens with the product's canonical name. Both conditions must
//  be true — the price alone could be a legitimate flash deal; the name alone
//  could be a lookalike variant. Together they are a near-certain mismatch.
//
//  A "cooler DeepCool R$19,99" linked to "Teclado Mecânico Ninja Leap R$979"
//  satisfies both: price < median/5 AND zero token overlap.
//  A "Ninja Leap 60% R$65" linked to the same product does NOT: it shares
//  "ninja" and "leap" with the canonical, so it is kept (variant, not garbage).
//
//  Outlier threshold: price < median / OUTLIER_RATIO  OR  > median * OUTLIER_RATIO
//  Default: 5× (configurable via --ratio <n>)
//
//  After unlinking, run `bun run backfill:products` to attempt re-resolution
//  with the current (improved) resolver. Many will stay unlinked if no good
//  candidate exists — that is correct.
//
//  Dry-run by default. Pass `--commit` to apply.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_OUTLIER_RATIO = 5;
const MIN_DEALS_FOR_MEDIAN = 3;

// Portuguese + English stopwords. Tokens shorter than 3 chars are also ignored.
const STOPWORDS = new Set([
  'de', 'do', 'da', 'dos', 'das', 'para', 'com', 'em', 'por', 'no', 'na',
  'nos', 'nas', 'ao', 'aos', 'as', 'os', 'ou', 'que', 'se', 'sem', 'sob',
  'sobre', 'ate', 'apos', 'um', 'uma', 'uns', 'umas', 'e', 'o', 'a',
  'the', 'and', 'or', 'of', 'for', 'in', 'to',
]);

interface UnlinkCandidate {
  dealId: number;
  productId: string;
  canonicalName: string;
  dealProduct: string;
  price: number;
  median: number;
  ratio: number;
}

async function run(commit: boolean, outlierRatio: number): Promise<void> {
  const mode = commit ? '\x1b[31mCOMMIT\x1b[0m' : '\x1b[33mDRY RUN\x1b[0m';
  console.log();
  console.log('═════════════════════════════════════════════════════════════════');
  console.log(`  unlink-outlier-deals — mode: ${mode}  (ratio: ${outlierRatio}×)`);
  if (!commit) {
    console.log('  (no DB mutations. Pass `--commit` to apply changes.)');
  }
  console.log('═════════════════════════════════════════════════════════════════\n');

  // Load all products that have at least MIN_DEALS_FOR_MEDIAN priced deals.
  const eligibleRaw = await db.execute<{ product_id: string }>(sql`
    SELECT product_id
    FROM deals
    WHERE price IS NOT NULL AND product_id IS NOT NULL
    GROUP BY product_id
    HAVING COUNT(*) >= ${sql.raw(String(MIN_DEALS_FOR_MEDIAN))}
  `);
  const eligibleIds = readRows<{ product_id: string }>(eligibleRaw).map(r => r.product_id);

  if (eligibleIds.length === 0) {
    console.log('  No eligible products found.\n');
    return;
  }

  console.log(`  Eligible products (${MIN_DEALS_FOR_MEDIAN}+ priced deals): ${eligibleIds.length}`);

  // Load products + their priced deals in batches.
  const BATCH = 500;
  const candidates: UnlinkCandidate[] = [];

  for (let i = 0; i < eligibleIds.length; i += BATCH) {
    const chunk = eligibleIds.slice(i, i + BATCH);

    const [productRows, dealRows] = await Promise.all([
      db.select({ id: productsTable.id, canonicalName: productsTable.canonicalName })
        .from(productsTable)
        .where(inArray(productsTable.id, chunk)),

      db.select({
        id: dealsTable.id,
        productId: dealsTable.productId,
        price: dealsTable.price,
        product: dealsTable.product,
      })
        .from(dealsTable)
        .where(inArray(dealsTable.productId, chunk))
        .then(rows => rows.filter(r => r.price !== null)),
    ]);

    const productMap = new Map(productRows.map(p => [p.id, p.canonicalName]));
    const dealsByProduct = new Map<string, typeof dealRows>();
    for (const d of dealRows) {
      if (!d.productId) continue;
      const list = dealsByProduct.get(d.productId) ?? [];
      list.push(d);
      dealsByProduct.set(d.productId, list);
    }

    for (const productId of chunk) {
      const canonicalName = productMap.get(productId);
      const deals = dealsByProduct.get(productId);
      if (!canonicalName || !deals || deals.length < MIN_DEALS_FOR_MEDIAN) continue;

      const prices = deals.map(d => d.price as number).sort((a, b) => a - b);
      const med = median(prices);
      if (med === 0) continue;

      for (const deal of deals) {
        const price = deal.price as number;
        const isOutlier = price < med / outlierRatio || price > med * outlierRatio;
        if (!isOutlier) continue;
        if (!deal.product) continue; // no AI name to compare → skip

        if (hasTokenOverlap(deal.product, canonicalName)) continue;

        candidates.push({
          dealId: deal.id,
          productId,
          canonicalName,
          dealProduct: deal.product,
          price,
          median: med,
          ratio: Math.round((price > med ? price / med : med / price) * 10) / 10,
        });
      }
    }

    process.stdout.write(`\r  Scanning: ${Math.min(i + BATCH, eligibleIds.length)}/${eligibleIds.length} products`);
  }

  console.log('\n');

  if (candidates.length === 0) {
    console.log('  ✓ No mismatch deals found.\n');
    return;
  }

  // Group by product for readable output.
  const byProduct = new Map<string, UnlinkCandidate[]>();
  for (const c of candidates) {
    const list = byProduct.get(c.productId) ?? [];
    list.push(c);
    byProduct.set(c.productId, list);
  }

  console.log(`  Found ${candidates.length} deal(s) to unlink across ${byProduct.size} product(s)\n`);

  for (const [, group] of byProduct) {
    const first = group[0];
    if (!first) continue;
    console.log(`  "${truncate(first.canonicalName, 62)}" (median R$${(first.median / 100).toFixed(2)})`);
    for (const c of group.slice(0, 5)) {
      const arrow = c.price < c.median ? '▼' : '▲';
      const brl = (c.price / 100).toFixed(2);
      console.log(`    ${arrow} deal #${c.dealId}  R$${brl} (${c.ratio}×)  "${truncate(c.dealProduct, 50)}"`);
    }
    if (group.length > 5) console.log(`    … and ${group.length - 5} more`);
    console.log();
  }

  if (!commit) {
    console.log('  DRY RUN complete. Re-run with `--commit` to unlink these deals.\n');
    console.log('  After committing: run `bun run backfill:products` to attempt re-resolution.\n');
    return;
  }

  // Unlink in chunks.
  const allDealIds = candidates.map(c => c.dealId);
  let unlinked = 0;
  const CHUNK = 500;
  for (let i = 0; i < allDealIds.length; i += CHUNK) {
    const batch = allDealIds.slice(i, i + CHUNK);
    const result = await db
      .update(dealsTable)
      .set({ productId: null })
      .where(inArray(dealsTable.id, batch));
    unlinked += drizzleAffectedRows(result);
  }

  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log(`  deals unlinked:  ${unlinked}`);
  console.log(`  products affected: ${byProduct.size}`);
  console.log();
  console.log('  Next steps:');
  console.log('    bun run backfill:products  — re-resolves unlinked deals');
  console.log('    bun run audit:catalog      — verifies the result');
  console.log();
}

// ── String helpers ────────────────────────────────────────────────────────────

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

function hasTokenOverlap(a: string, b: string): boolean {
  const ta = tokenize(a);
  const tb = tokenize(b);
  for (const t of ta) {
    if (tb.has(t)) return true;
  }
  return false;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]);
  }
  return [];
}

function drizzleAffectedRows(result: unknown): number {
  if (Array.isArray(result) && result[0] && typeof result[0] === 'object') {
    return (result[0] as { affectedRows?: number }).affectedRows ?? 0;
  }
  return 0;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const commit = process.argv.includes('--commit');
const ratioArg = process.argv.find(a => a.startsWith('--ratio='));
const outlierRatio = ratioArg ? Number(ratioArg.split('=')[1]) : DEFAULT_OUTLIER_RATIO;

run(commit, outlierRatio)
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Script aborted', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });
