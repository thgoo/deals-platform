/* eslint-disable no-console */
import 'dotenv/config';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productMatchDecisionsTable } from '~/db/schemas/product-match-decisions';
import { productsTable } from '~/db/schemas/products';
import { logger } from '~/logger';
import { specsConflict } from '~/products/utils/spec-conflict';

// ─────────────────────────────────────────────────────────────────────────────
// Audit (read-only) over the catalog. Surfaces three classes of issue:
//
//   1. Exact-name duplicates: two `products` rows with identical canonical_name
//      that should have been merged.
//
//   2. Spec-conflicting deal→product matches: deals whose AI-extracted product
//      name disagrees with the linked canonical product on a known spec (BTU,
//      GB, RTX model, polegadas, etc.). These slipped through before the
//      `specsConflict` gate landed. Grouped by resolution method so we can see
//      which path (URL anchor / embedding / judge) produced the worst data.
//
//   3. Top affected canonicals: which canonical products are absorbing the
//      most wrong matches — the cleanup priorities.
//
// Output is plain-text to stdout, designed to be skimmed in the terminal or
// piped to a file: `bun run audit:catalog > /tmp/audit.txt`.
// ─────────────────────────────────────────────────────────────────────────────

interface DuplicateGroup {
  canonicalName: string;
  productIds: string[];
  dealCountPerProduct: Map<string, number>;
}

interface SpecConflictRow {
  dealId: number;
  dealProduct: string;
  productId: string;
  canonicalName: string;
  method: string;
  similarityScore: number | null;
}

async function findExactNameDuplicates(): Promise<DuplicateGroup[]> {
  const result = await db.execute<{
    canonical_name: string;
    count: number | string;
    ids: string;
  }>(sql`
    SELECT canonical_name, COUNT(*) AS count, GROUP_CONCAT(id) AS ids
    FROM products
    GROUP BY canonical_name
    HAVING COUNT(*) > 1
    ORDER BY count DESC, canonical_name
  `);

  const rows = readRows<{ canonical_name: string; count: number | string; ids: string }>(result);
  if (rows.length === 0) return [];

  const allIds = rows.flatMap(r => r.ids.split(','));
  const dealCounts = await db
    .select({
      productId: dealsTable.productId,
      count: sql<string>`COUNT(*)`,
    })
    .from(dealsTable)
    .where(inArray(dealsTable.productId, allIds))
    .groupBy(dealsTable.productId);

  const countMap = new Map<string, number>();
  for (const row of dealCounts) {
    if (row.productId) countMap.set(row.productId, Number(row.count));
  }

  return rows.map(r => {
    const ids = r.ids.split(',');
    return {
      canonicalName: r.canonical_name,
      productIds: ids,
      dealCountPerProduct: new Map(ids.map(id => [id, countMap.get(id) ?? 0])),
    };
  });
}

async function findSpecConflictingMatches(): Promise<SpecConflictRow[]> {
  // Every deal currently linked to a canonical product. Pull both names so we
  // can run `specsConflict` in memory (would be painful in SQL).
  const linked = await db
    .select({
      dealId: dealsTable.id,
      dealProduct: dealsTable.product,
      productId: dealsTable.productId,
      canonicalName: productsTable.canonicalName,
    })
    .from(dealsTable)
    .innerJoin(productsTable, eq(dealsTable.productId, productsTable.id))
    .where(and(
      isNotNull(dealsTable.product),
      isNotNull(dealsTable.productId),
    ));

  const flagged = linked.filter(r => (
    r.dealProduct
    && r.canonicalName
    && specsConflict(r.dealProduct, r.canonicalName)
  ));

  if (flagged.length === 0) return [];

  // Look up the latest decision per flagged deal so we can attribute the bad
  // match to the resolver path that produced it.
  const dealIds = flagged.map(f => f.dealId);
  const decisions = await db
    .select({
      dealId: productMatchDecisionsTable.dealId,
      id: productMatchDecisionsTable.id,
      method: productMatchDecisionsTable.method,
      similarityScore: productMatchDecisionsTable.similarityScore,
    })
    .from(productMatchDecisionsTable)
    .where(inArray(productMatchDecisionsTable.dealId, dealIds));

  // Multiple decisions per deal can exist (e.g., backfill re-ran); the latest
  // one (highest id) is the source of the current link.
  const latestPerDeal = new Map<number, { method: string; similarityScore: string | null }>();
  for (const d of decisions) {
    const prev = latestPerDeal.get(d.dealId);
    if (!prev || d.id) {
      latestPerDeal.set(d.dealId, { method: d.method, similarityScore: d.similarityScore });
    }
  }

  return flagged.map(f => {
    const dec = latestPerDeal.get(f.dealId);
    const score = dec?.similarityScore;
    return {
      dealId: f.dealId,
      dealProduct: f.dealProduct ?? '',
      productId: f.productId ?? '',
      canonicalName: f.canonicalName ?? '',
      method: dec?.method ?? 'unknown',
      similarityScore: score === null || score === undefined ? null : Number(score),
    };
  });
}

// ── Output ───────────────────────────────────────────────────────────────────

function divider(title: string): void {
  const bar = '═'.repeat(65);
  console.log(`\n${bar}`);
  console.log(`  ${title}`);
  console.log(`${bar}\n`);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function printDuplicates(dupes: DuplicateGroup[]): void {
  divider('EXACT-NAME DUPLICATES IN PRODUCTS TABLE');

  if (dupes.length === 0) {
    console.log('  ✓ no exact-name duplicates found');
    return;
  }

  console.log(`  ${dupes.length} canonical name(s) with multiple product ids.\n`);
  for (const d of dupes) {
    console.log(`  "${d.canonicalName}"`);
    for (const id of d.productIds) {
      const deals = d.dealCountPerProduct.get(id) ?? 0;
      const noun = deals === 1 ? 'deal' : 'deals';
      console.log(`    - ${id}  (${deals} ${noun})`);
    }
    console.log();
  }
}

function printConflicts(conflicts: SpecConflictRow[]): void {
  divider('SPEC-CONFLICTING DEAL → PRODUCT MATCHES');

  if (conflicts.length === 0) {
    console.log('  ✓ no spec conflicts detected');
    return;
  }

  const byMethod = new Map<string, SpecConflictRow[]>();
  for (const c of conflicts) {
    const bucket = byMethod.get(c.method);
    if (bucket) bucket.push(c);
    else byMethod.set(c.method, [c]);
  }

  console.log(`  ${conflicts.length} flagged deal(s).\n`);
  console.log('  By method:');
  const sortedMethods = [...byMethod.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [method, list] of sortedMethods) {
    console.log(`    - ${method.padEnd(18)} ${list.length}`);
  }
  console.log();

  const PER_METHOD_LIMIT = 25;
  for (const [method, list] of sortedMethods) {
    console.log(`  ── ${method} ──`);
    for (const c of list.slice(0, PER_METHOD_LIMIT)) {
      const score = c.similarityScore !== null
        ? `${(c.similarityScore * 100).toFixed(1)}%`
        : '—';
      console.log(`    deal #${c.dealId}  "${truncate(c.dealProduct, 56)}"`);
      console.log(`              → "${truncate(c.canonicalName, 56)}"  ${score}  (product ${c.productId.slice(0, 8)})`);
    }
    if (list.length > PER_METHOD_LIMIT) {
      console.log(`    … and ${list.length - PER_METHOD_LIMIT} more`);
    }
    console.log();
  }
}

function printTopAffectedCanonicals(conflicts: SpecConflictRow[]): void {
  divider('TOP AFFECTED CANONICAL PRODUCTS (cleanup priorities)');

  if (conflicts.length === 0) {
    console.log('  ✓ nothing to clean up');
    return;
  }

  // Group conflicts by the target product (productId) — the canonical being
  // wrongly absorbed into. Sort by # of wrong deals attached.
  const byTarget = new Map<string, { canonicalName: string; deals: number; dealIds: number[] }>();
  for (const c of conflicts) {
    const existing = byTarget.get(c.productId);
    if (existing) {
      existing.deals += 1;
      existing.dealIds.push(c.dealId);
    } else {
      byTarget.set(c.productId, {
        canonicalName: c.canonicalName,
        deals: 1,
        dealIds: [c.dealId],
      });
    }
  }

  const top = [...byTarget.entries()]
    .sort((a, b) => b[1].deals - a[1].deals)
    .slice(0, 15);

  console.log(`  ${byTarget.size} canonical(s) affected. Top 15:\n`);
  for (const [productId, info] of top) {
    console.log(`  ${productId.slice(0, 8)}  "${truncate(info.canonicalName, 60)}"`);
    console.log(`            ${info.deals} wrong deal(s)`);
  }
}

async function main(): Promise<void> {
  console.log('Running catalog audit (read-only)...\n');
  const start = Date.now();

  const [dupes, conflicts] = await Promise.all([
    findExactNameDuplicates(),
    findSpecConflictingMatches(),
  ]);

  printDuplicates(dupes);
  printConflicts(conflicts);
  printTopAffectedCanonicals(conflicts);

  divider('SUMMARY');
  console.log(`  Exact-name duplicate groups: ${dupes.length}`);
  console.log(`  Spec-conflicting deal matches: ${conflicts.length}`);
  console.log(`  Total runtime: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log();
}

// drizzle's execute() returns either an array of rows or `[rows, fields]` depending
// on the underlying mysql2 path; normalize once at the boundary.
function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]);
  }
  return [];
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Audit aborted', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });
