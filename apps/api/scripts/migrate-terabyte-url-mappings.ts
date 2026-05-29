/* eslint-disable no-console */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import db from '~/db';
import { logger } from '~/logger';

// ─────────────────────────────────────────────────────────────────────────────
//  migrate-terabyte-url-mappings
//
//  Converts existing url_mapping rows from the host-fallback format to the
//  new terabyte-specific format:
//
//    BEFORE  source = 'terabyteshop.com.br'
//            external_id = 'produto/27406/processador-intel-...'
//
//    AFTER   source = 'terabyte'
//            external_id = '27406'
//
//  The numeric product ID is extracted from the pathname. Rows whose path
//  does not match /produto/<id>/ are left untouched and logged as skipped.
//
//  Collision handling: if a (source='terabyte', external_id='27406') row
//  already exists (from a deal processed after the new identifier was
//  registered but before this migration ran), the old fallback row is simply
//  deleted — the mapping is already correct.
//
//  Run AFTER split:overmerged and BEFORE backfill:products.
//  Dry-run by default. Pass `--commit` to apply changes.
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_ID_RE = /\/produto\/(\d+)/i;

interface FallbackRow {
  id: number;
  external_id: string;
  product_id: string;
  confidence: string;
  created_at: Date;
}

interface MigrationPlan {
  id: number;
  oldExternalId: string;
  newExternalId: string;
  productId: string;
}

async function run(commit: boolean): Promise<void> {
  const mode = commit ? '\x1b[31mCOMMIT\x1b[0m' : '\x1b[33mDRY RUN\x1b[0m';
  console.log();
  console.log('═════════════════════════════════════════════════════════════════');
  console.log(`  migrate-terabyte-url-mappings — mode: ${mode}`);
  if (!commit) {
    console.log('  (no DB mutations. Pass `--commit` to actually apply changes.)');
  }
  console.log('═════════════════════════════════════════════════════════════════');
  console.log();

  // Fetch all rows currently under the fallback source name.
  const rawRows = await db.execute<FallbackRow>(sql`
    SELECT id, external_id, product_id, confidence, created_at
    FROM product_url_mappings
    WHERE source = 'terabyteshop.com.br'
    ORDER BY id ASC
  `);

  const rows = readRows<FallbackRow>(rawRows);
  console.log(`  Found ${rows.length} fallback row(s) for terabyteshop.com.br\n`);

  if (rows.length === 0) {
    console.log('  Nothing to migrate.');
    return;
  }

  const plans: MigrationPlan[] = [];
  const skipped: { id: number; externalId: string }[] = [];

  for (const row of rows) {
    const match = row.external_id.match(PRODUCT_ID_RE);
    if (!match?.[1]) {
      skipped.push({ id: row.id, externalId: row.external_id });
      continue;
    }
    plans.push({
      id: row.id,
      oldExternalId: row.external_id,
      newExternalId: match[1],
      productId: row.product_id,
    });
  }

  console.log(`  Rows to migrate:  ${plans.length}`);
  console.log(`  Rows skipped:     ${skipped.length} (no /produto/<id>/ pattern)`);

  if (skipped.length > 0) {
    console.log('\n  Skipped rows:');
    for (const s of skipped) {
      console.log(`    id=${s.id}  external_id=${s.externalId}`);
    }
  }

  if (!commit) {
    console.log('\n  Sample conversions:');
    for (const p of plans.slice(0, 10)) {
      console.log(`    ${p.oldExternalId} → terabyte:${p.newExternalId}`);
    }
    if (plans.length > 10) {
      console.log(`    … and ${plans.length - 10} more`);
    }
    console.log('\n  DRY RUN complete. Re-run with `--commit` to apply.');
    return;
  }

  // Apply in chunks inside individual try/catch so a single collision doesn't
  // abort the whole migration.
  let migrated = 0;
  let collisions = 0;
  let failed = 0;
  const CHUNK = 100;

  for (let i = 0; i < plans.length; i += CHUNK) {
    const batch = plans.slice(i, i + CHUNK);

    for (const plan of batch) {
      try {
        // Attempt to update in-place: change source and external_id.
        // If (source='terabyte', external_id=plan.newExternalId) already exists
        // for a DIFFERENT product_id, this UPDATE would succeed but the new row
        // would violate the unique index on the next INSERT — catch that too.
        await db.execute(sql`
          UPDATE product_url_mappings
          SET    source      = 'terabyte',
                 external_id = ${plan.newExternalId}
          WHERE  id          = ${plan.id}
        `);
        migrated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isDupe = msg.toLowerCase().includes('duplicate') || msg.includes('1062');

        if (isDupe) {
          // A 'terabyte':<newExternalId> row already exists. The mapping is
          // already correct; just delete this stale fallback row.
          try {
            await db.execute(sql`
              DELETE FROM product_url_mappings WHERE id = ${plan.id}
            `);
            collisions++;
          } catch {
            failed++;
          }
        } else {
          console.log(`    ✗ id=${plan.id}: ${msg}`);
          failed++;
        }
      }
    }

    const done = Math.min(i + CHUNK, plans.length);
    process.stdout.write(`\r  Progress: ${done}/${plans.length}`);
  }

  console.log('\n');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═════════════════════════════════════════════════════════════════');
  console.log(`  migrated:   ${migrated}`);
  console.log(`  collisions: ${collisions} (already existed as terabyte, deleted old fallback)`);
  console.log(`  failed:     ${failed}`);
  console.log(`  skipped:    ${skipped.length}`);
  console.log();
  if (failed === 0) {
    console.log('  Next steps:');
    console.log('    1. bun run backfill:products');
    console.log('    2. bun run audit:catalog');
  } else {
    console.log(`  ⚠ ${failed} row(s) failed — investigate before running backfill:products`);
  }
  console.log();
}

function readRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return Array.isArray(result[0]) ? (result[0] as T[]) : (result as T[]);
  }
  return [];
}

const commit = process.argv.includes('--commit');

run(commit)
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Migration aborted', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });
