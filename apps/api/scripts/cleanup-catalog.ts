/* eslint-disable no-console */
import 'dotenv/config';
import { and, eq, inArray, sql } from 'drizzle-orm';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { productMatchDecisionsTable } from '~/db/schemas/product-match-decisions';
import { productUrlMappingsTable } from '~/db/schemas/product-url-mappings';
import { productsTable } from '~/db/schemas/products';
import { extractExternalIds } from '~/link-pipeline/identifiers/identifier-extractor';
import { buildIdentifierRegistry } from '~/link-pipeline/identifiers/registry';
import { logger } from '~/logger';
import { specsConflict } from '~/products/utils/spec-conflict';

// ─────────────────────────────────────────────────────────────────────────────
//  cleanup-catalog
//
//  Two phases, single transaction-per-unit-of-work:
//    Phase 1 — merges exact-name product duplicates. Winner = most deals,
//              tiebreak longest canonical_name, final tiebreak product id asc.
//              Each group runs in its own transaction; one bad group doesn't
//              abort the rest.
//    Phase 2 — finds deals whose specs disagree with their linked canonical
//              product (uses the same `specsConflict` heuristic as the live
//              resolver). For url_anchor decisions, re-extracts the
//              (source, external_id) from deal.links and deletes the bad
//              mapping that produced the wrong match. Then unlinks every
//              spec-conflicting deal so the next `backfill:products` run
//              picks them up and re-resolves them with the current code
//              (specsConflict gate, full-catalog candidate scan).
//
//  Dry-run by default — pass `--commit` to actually mutate the DB.
//  After a successful commit, run `bun run backfill:products` to re-resolve
//  the unlinked deals, then `bun run audit:catalog` to verify.
// ─────────────────────────────────────────────────────────────────────────────

interface DupCandidate {
  id: string;
  createdAt: Date;
  nameLength: number;
  dealCount: number;
}

interface MergePlan {
  canonicalName: string;
  winner: DupCandidate;
  losers: DupCandidate[];
}

interface MergeResult {
  dealsRepointed: number;
  mappingsRepointed: number;
  mappingsDeleted: number;
  decisionsRepointed: number;
}

interface Phase1Stats {
  groupsProcessed: number;
  groupsCommitted: number;
  groupsFailed: number;
  productsDeleted: number;
  dealsRepointed: number;
  mappingsRepointed: number;
  decisionsRepointed: number;
}

interface ConflictedDeal {
  dealId: number;
  dealProduct: string;
  productId: string;
  canonicalName: string;
  links: string[];
  method: string;
}

interface BadMapping {
  source: string;
  externalId: string;
  productId: string;
}

interface Phase2Stats {
  conflictsFound: number;
  byMethod: Map<string, number>;
  badMappingsFound: number;
  mappingsDeleted: number;
  dealsUnlinked: number;
}

class Cleanup {
  private readonly registry = buildIdentifierRegistry();

  constructor(private readonly commit: boolean) {}

  async run(): Promise<void> {
    this.printHeader();
    const phase1 = await this.mergeDuplicates();
    const phase2 = await this.fixSpecConflicts();
    this.printSummary(phase1, phase2);
  }

  // ── Phase 1 ────────────────────────────────────────────────────────────────

  private async mergeDuplicates(): Promise<Phase1Stats> {
    sectionHeader('PHASE 1 — merge exact-name product duplicates');

    const stats: Phase1Stats = {
      groupsProcessed: 0,
      groupsCommitted: 0,
      groupsFailed: 0,
      productsDeleted: 0,
      dealsRepointed: 0,
      mappingsRepointed: 0,
      decisionsRepointed: 0,
    };

    const plans = await this.buildMergePlans();
    if (plans.length === 0) {
      console.log('  ✓ no exact-name duplicates found\n');
      return stats;
    }

    console.log(`  ${plans.length} duplicate group(s) to merge\n`);

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i]!;
      stats.groupsProcessed++;

      this.printMergePlanLine(i + 1, plans.length, plan);

      if (!this.commit) {
        stats.groupsCommitted++;
        continue;
      }

      try {
        const result = await this.executeMerge(plan);
        stats.groupsCommitted++;
        stats.productsDeleted += plan.losers.length;
        stats.dealsRepointed += result.dealsRepointed;
        stats.mappingsRepointed += result.mappingsRepointed;
        stats.decisionsRepointed += result.decisionsRepointed;
      } catch (err) {
        stats.groupsFailed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`        ✗ FAILED — ${msg}`);
      }
    }

    console.log();
    return stats;
  }

  private async buildMergePlans(): Promise<MergePlan[]> {
    const groupsRaw = await db.execute<{ canonical_name: string; ids: string }>(sql`
      SELECT canonical_name, GROUP_CONCAT(id) AS ids
      FROM products
      GROUP BY canonical_name
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, canonical_name
    `);

    const groups = readRows<{ canonical_name: string; ids: string }>(groupsRaw);
    if (groups.length === 0) return [];

    const allIds = groups.flatMap(g => g.ids.split(','));

    const productsRaw = await db
      .select({
        id: productsTable.id,
        canonicalName: productsTable.canonicalName,
        createdAt: productsTable.createdAt,
      })
      .from(productsTable)
      .where(inArray(productsTable.id, allIds));

    const dealCountsRaw = await db
      .select({
        productId: dealsTable.productId,
        count: sql<string>`COUNT(*)`,
      })
      .from(dealsTable)
      .where(inArray(dealsTable.productId, allIds))
      .groupBy(dealsTable.productId);

    const dealCounts = new Map<string, number>();
    for (const row of dealCountsRaw) {
      if (row.productId) dealCounts.set(row.productId, Number(row.count));
    }

    const productById = new Map<string, { canonicalName: string; createdAt: Date }>();
    for (const p of productsRaw) {
      productById.set(p.id, { canonicalName: p.canonicalName, createdAt: p.createdAt });
    }

    const plans: MergePlan[] = [];
    for (const g of groups) {
      const ids = g.ids.split(',');
      const candidates: DupCandidate[] = ids.map(id => {
        const meta = productById.get(id);
        return {
          id,
          createdAt: meta?.createdAt ?? new Date(0),
          nameLength: (meta?.canonicalName ?? '').length,
          dealCount: dealCounts.get(id) ?? 0,
        };
      });

      // Winner: most deals → longest name → smallest id (deterministic tiebreak).
      candidates.sort((a, b) => {
        if (b.dealCount !== a.dealCount) return b.dealCount - a.dealCount;
        if (b.nameLength !== a.nameLength) return b.nameLength - a.nameLength;
        return a.id.localeCompare(b.id);
      });

      const [winner, ...losers] = candidates;
      if (!winner || losers.length === 0) continue;

      plans.push({ canonicalName: g.canonical_name, winner, losers });
    }

    return plans;
  }

  private async executeMerge(plan: MergePlan): Promise<MergeResult> {
    const winnerId = plan.winner.id;
    const loserIds = plan.losers.map(l => l.id);

    return db.transaction(async tx => {
      // Move loser mappings onto winner. INSERT IGNORE handles unique key
      // collisions when winner already has a mapping for the same external id.
      const insertResult = await tx.execute(sql`
        INSERT IGNORE INTO product_url_mappings (source, external_id, product_id, confidence, created_at)
        SELECT source, external_id, ${winnerId}, confidence, created_at
        FROM product_url_mappings
        WHERE product_id IN (${sql.join(loserIds.map(id => sql`${id}`), sql`, `)})
      `);
      // Drizzle returns ResultSetHeader for execute(); we don't strictly need
      // the count here but pull it for the result struct.
      const mappingsRepointed = mysqlAffectedRows(insertResult);

      const deleteMapResult = await tx
        .delete(productUrlMappingsTable)
        .where(inArray(productUrlMappingsTable.productId, loserIds));
      const mappingsDeleted = drizzleAffectedRows(deleteMapResult);

      const dealUpdate = await tx
        .update(dealsTable)
        .set({ productId: winnerId })
        .where(inArray(dealsTable.productId, loserIds));
      const dealsRepointed = drizzleAffectedRows(dealUpdate);

      const decisionUpdate = await tx
        .update(productMatchDecisionsTable)
        .set({ productId: winnerId })
        .where(inArray(productMatchDecisionsTable.productId, loserIds));
      const decisionsRepointed = drizzleAffectedRows(decisionUpdate);

      await tx.delete(productsTable).where(inArray(productsTable.id, loserIds));

      return { dealsRepointed, mappingsRepointed, mappingsDeleted, decisionsRepointed };
    });
  }

  private printMergePlanLine(i: number, total: number, plan: MergePlan): void {
    console.log(`  [${i}/${total}] "${truncate(plan.canonicalName, 60)}"`);
    console.log(`        winner: ${plan.winner.id.slice(0, 8)} (${plan.winner.dealCount} deals)`);
    const losersStr = plan.losers
      .map(l => `${l.id.slice(0, 8)} (${l.dealCount})`)
      .join(', ');
    console.log(`        loser(s): ${losersStr}`);
  }

  // ── Phase 2 ────────────────────────────────────────────────────────────────

  private async fixSpecConflicts(): Promise<Phase2Stats> {
    sectionHeader('PHASE 2 — fix spec-conflicting deal matches');

    const stats: Phase2Stats = {
      conflictsFound: 0,
      byMethod: new Map(),
      badMappingsFound: 0,
      mappingsDeleted: 0,
      dealsUnlinked: 0,
    };

    const conflicts = await this.findSpecConflicts();
    if (conflicts.length === 0) {
      console.log('  ✓ no spec conflicts found\n');
      return stats;
    }

    stats.conflictsFound = conflicts.length;
    for (const c of conflicts) {
      stats.byMethod.set(c.method, (stats.byMethod.get(c.method) ?? 0) + 1);
    }

    console.log(`  ${conflicts.length} conflicted deal(s)`);
    console.log('  by method:');
    for (const [method, count] of [...stats.byMethod.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    - ${method.padEnd(18)} ${count}`);
    }
    console.log();

    const badMappings = await this.findBadMappings(conflicts);
    stats.badMappingsFound = badMappings.length;
    console.log(`  ${badMappings.length} bad url mapping(s) identified for deletion\n`);

    if (!this.commit) {
      // In dry-run still print a sample so the operator can sanity-check
      const sample = badMappings.slice(0, 10);
      if (sample.length > 0) {
        console.log('  sample of mappings that would be deleted:');
        for (const m of sample) {
          console.log(`    ${m.source}:${m.externalId.slice(0, 40)} → product ${m.productId.slice(0, 8)}`);
        }
        console.log();
      }
      return stats;
    }

    // Delete bad mappings (chunked to stay polite to MySQL).
    stats.mappingsDeleted = await this.deleteBadMappings(badMappings);
    console.log(`  ✓ deleted ${stats.mappingsDeleted} bad mapping(s)`);

    // Unlink all conflicted deals so backfill picks them up.
    stats.dealsUnlinked = await this.unlinkDeals(conflicts.map(c => c.dealId));
    console.log(`  ✓ unlinked ${stats.dealsUnlinked} deal(s) — product_id set to NULL\n`);

    return stats;
  }

  private async findSpecConflicts(): Promise<ConflictedDeal[]> {
    const linked = await db
      .select({
        dealId: dealsTable.id,
        dealProduct: dealsTable.product,
        productId: dealsTable.productId,
        canonicalName: productsTable.canonicalName,
        links: dealsTable.links,
      })
      .from(dealsTable)
      .innerJoin(productsTable, eq(dealsTable.productId, productsTable.id));

    const flagged = linked.filter(r => (
      r.dealProduct
      && r.canonicalName
      && r.productId
      && specsConflict(r.dealProduct, r.canonicalName)
    ));

    if (flagged.length === 0) return [];

    // Resolve the latest decision method per deal (highest id = most recent).
    const dealIds = flagged.map(f => f.dealId);
    const decisions = await db
      .select({
        dealId: productMatchDecisionsTable.dealId,
        id: productMatchDecisionsTable.id,
        method: productMatchDecisionsTable.method,
      })
      .from(productMatchDecisionsTable)
      .where(inArray(productMatchDecisionsTable.dealId, dealIds));

    const latestMethod = new Map<number, string>();
    for (const d of decisions) {
      const prev = latestMethod.get(d.dealId);
      if (prev === undefined || d.id) latestMethod.set(d.dealId, d.method);
    }

    return flagged.map(f => ({
      dealId: f.dealId,
      dealProduct: f.dealProduct ?? '',
      productId: f.productId ?? '',
      canonicalName: f.canonicalName ?? '',
      links: parseLinks(f.links),
      method: latestMethod.get(f.dealId) ?? 'unknown',
    }));
  }

  /**
   * Re-derive the (source, external_id) that each url-anchor conflict deal
   * came from, then intersect with the actual mappings table. Only mappings
   * that (1) point to the deal's bad canonical AND (2) match an external id
   * extracted from the deal's links are surfaced as "bad".
   */
  private async findBadMappings(conflicts: ConflictedDeal[]): Promise<BadMapping[]> {
    const urlAnchorConflicts = conflicts.filter(c => c.method === 'url_anchor');
    if (urlAnchorConflicts.length === 0) return [];

    const affectedProductIds = [...new Set(urlAnchorConflicts.map(c => c.productId))];
    const allMappings = await db
      .select({
        source: productUrlMappingsTable.source,
        externalId: productUrlMappingsTable.externalId,
        productId: productUrlMappingsTable.productId,
      })
      .from(productUrlMappingsTable)
      .where(inArray(productUrlMappingsTable.productId, affectedProductIds));

    // Index existing mappings by product → set of "source:external_id".
    const mappingsByProduct = new Map<string, Set<string>>();
    for (const m of allMappings) {
      let set = mappingsByProduct.get(m.productId);
      if (!set) {
        set = new Set();
        mappingsByProduct.set(m.productId, set);
      }
      set.add(`${m.source}:${m.externalId}`);
    }

    const found = new Map<string, BadMapping>(); // dedupe
    for (const deal of urlAnchorConflicts) {
      const ids = extractExternalIds(deal.links, this.registry);
      const productMappings = mappingsByProduct.get(deal.productId);
      if (!productMappings) continue;

      for (const eid of ids) {
        const key = `${eid.source}:${eid.externalId}`;
        if (!productMappings.has(key)) continue;
        const fullKey = `${key}:${deal.productId}`;
        if (found.has(fullKey)) continue;
        found.set(fullKey, {
          source: eid.source,
          externalId: eid.externalId,
          productId: deal.productId,
        });
      }
    }

    return [...found.values()];
  }

  private async deleteBadMappings(mappings: BadMapping[]): Promise<number> {
    let deleted = 0;
    const CHUNK = 50;
    for (let i = 0; i < mappings.length; i += CHUNK) {
      const batch = mappings.slice(i, i + CHUNK);
      const result = await db.delete(productUrlMappingsTable).where(
        // OR across (source, external_id, product_id) tuples in the batch.
        sql.join(
          batch.map(m => sql`(
            ${productUrlMappingsTable.source} = ${m.source}
            AND ${productUrlMappingsTable.externalId} = ${m.externalId}
            AND ${productUrlMappingsTable.productId} = ${m.productId}
          )`),
          sql` OR `,
        ),
      );
      deleted += drizzleAffectedRows(result);
    }
    return deleted;
  }

  private async unlinkDeals(dealIds: number[]): Promise<number> {
    if (dealIds.length === 0) return 0;
    let unlinked = 0;
    const CHUNK = 500;
    for (let i = 0; i < dealIds.length; i += CHUNK) {
      const batch = dealIds.slice(i, i + CHUNK);
      const result = await db
        .update(dealsTable)
        .set({ productId: null })
        .where(inArray(dealsTable.id, batch));
      unlinked += drizzleAffectedRows(result);
    }
    return unlinked;
  }

  // ── Output ─────────────────────────────────────────────────────────────────

  private printHeader(): void {
    const mode = this.commit ? '\x1b[31mCOMMIT\x1b[0m' : '\x1b[33mDRY RUN\x1b[0m';
    console.log();
    console.log('═════════════════════════════════════════════════════════════════');
    console.log(`  catalog cleanup — mode: ${mode}`);
    if (!this.commit) {
      console.log('  (no DB mutations. Pass `--commit` to actually apply changes.)');
    }
    console.log('═════════════════════════════════════════════════════════════════');
    console.log();
  }

  private printSummary(p1: Phase1Stats, p2: Phase2Stats): void {
    sectionHeader('SUMMARY');
    console.log('  Phase 1 — exact-name merges');
    console.log(`    groups processed:      ${p1.groupsProcessed}`);
    console.log(`    groups ${this.commit ? 'committed' : 'planned   '}:      ${p1.groupsCommitted}`);
    if (this.commit) {
      console.log(`    groups failed:         ${p1.groupsFailed}`);
      console.log(`    products deleted:      ${p1.productsDeleted}`);
      console.log(`    deals repointed:       ${p1.dealsRepointed}`);
      console.log(`    decisions repointed:   ${p1.decisionsRepointed}`);
      console.log(`    mappings repointed:    ${p1.mappingsRepointed}`);
    }
    console.log();
    console.log('  Phase 2 — spec-conflict cleanup');
    console.log(`    deals flagged:         ${p2.conflictsFound}`);
    console.log(`    bad mappings found:    ${p2.badMappingsFound}`);
    if (this.commit) {
      console.log(`    bad mappings deleted:  ${p2.mappingsDeleted}`);
      console.log(`    deals unlinked:        ${p2.dealsUnlinked}`);
    }
    console.log();
    if (this.commit) {
      console.log('  Next steps:');
      console.log('    1. Run `bun run backfill:products` to re-resolve the unlinked deals.');
      console.log('    2. Run `bun run audit:catalog` to verify the cleanup.');
    } else {
      console.log('  DRY RUN complete. Re-run with `--commit` to apply.');
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

// drizzle returns [resultSetHeader, ...] from a write — pull affectedRows.
function drizzleAffectedRows(result: unknown): number {
  if (Array.isArray(result) && result[0] && typeof result[0] === 'object') {
    const header = result[0] as { affectedRows?: number };
    return header.affectedRows ?? 0;
  }
  return 0;
}

function mysqlAffectedRows(result: unknown): number {
  // execute() returns [ResultSetHeader, fields] like raw mysql2.
  return drizzleAffectedRows(result);
}

// ── Entry ─────────────────────────────────────────────────────────────────────

const commit = process.argv.includes('--commit');

new Cleanup(commit)
  .run()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Cleanup aborted', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });
