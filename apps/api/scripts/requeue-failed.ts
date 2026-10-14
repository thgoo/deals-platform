// Sends messages whose ingestion failed for good (outcome = failed) back through
// the pipeline — e.g. after an AI provider outage longer than the retry window.
//
//   bun run scripts/requeue-failed.ts                 # all failed messages
//   bun run scripts/requeue-failed.ts 2026-10-14      # only those received since that date
//
// The running api's worker picks them up within a few seconds.

import RawMessageService from '~/ingest/raw-message-service';

const sinceArg = process.argv[2];
const since = sinceArg ? new Date(sinceArg) : undefined;
if (since && Number.isNaN(since.getTime())) {
  console.error(`Not a date: ${sinceArg}`);
  process.exit(1);
}

const count = await new RawMessageService().requeueFailed(since);
console.log(`Requeued ${count} failed message(s)${since ? ` received since ${since.toISOString()}` : ''}.`);
process.exit(0);
