// Photo retention: deletes deal photos older than N days and clears the deals'
// local_path (the deals themselves stay). Also removes orphan photos — ones whose
// message never became a deal. Meant for a daily cron.
//
//   bun run media:prune -- --dry-run             # what would go, changes nothing
//   bun run media:prune                          # 30 days
//   bun run media:prune -- --days 45

import { and, gte, isNotNull, like, lt, ne } from 'drizzle-orm';
import { parseArgs } from 'util';
import { config } from '~/config';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { rawMessagesTable } from '~/db/schemas/raw-messages';
import { photoFileName, prunePhotoFiles } from '~/media/prune';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'days': { type: 'string', default: '30' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const days = Number(values.days);
if (!Number.isInteger(days) || days < 7) {
  console.error(`--days must be a whole number ≥ 7 (got ${values.days})`);
  process.exit(1);
}
const dryRun = values['dry-run'];
const cutoff = new Date(Date.now() - days * 86_400_000);

// Photos still needed: recent deals, and messages still going through ingestion.
const recent = await db.select({ p: dealsTable.localPath }).from(dealsTable)
  .where(and(gte(dealsTable.ts, cutoff), like(dealsTable.localPath, 'media/%')));
const inFlight = await db.select({ p: rawMessagesTable.photoPath }).from(rawMessagesTable)
  .where(and(ne(rawMessagesTable.step, 'done'), isNotNull(rawMessagesTable.photoPath)));
const keep = new Set([...recent, ...inFlight].map(r => photoFileName(r.p)).filter(f => f !== null));

// Deals first, files second: if deleting a file fails, it's an orphan the next run removes —
// never a deal pointing at a missing file.
const oldDeals = and(lt(dealsTable.ts, cutoff), like(dealsTable.localPath, 'media/%'));
const cleared = dryRun
  ? (await db.$count(dealsTable, oldDeals))
  : (await db.update(dealsTable).set({ localPath: null }).where(oldDeals).returning({ id: dealsTable.id })).length;

const files = await prunePhotoFiles(config.MEDIA_DIR, cutoff, keep, dryRun);

console.log(
  `${dryRun ? '[dry run] ' : ''}Photos older than ${days} days (before ${cutoff.toISOString().slice(0, 10)}): `
  + `${cleared} deal(s) cleared, ${files.deleted} file(s) deleted (${(files.bytes / 1e9).toFixed(2)} GB), `
  + `${files.kept} kept.`,
);
process.exit(0);
