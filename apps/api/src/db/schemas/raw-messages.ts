import type { DealPayload } from '@bargah/shared';
import type { InferSelectModel } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { ExternalId } from '~/link-pipeline/types';
import { dealsTable } from './deals';

/**
 * Where a message is in the ingestion pipeline. The worker claims rows by step:
 * extract (link pipeline + AI → deal) → resolve (product matching) → notify
 * (keyword alerts) → done.
 */
export const INGEST_STEPS = ['extract', 'resolve', 'notify', 'done'] as const;
export type IngestStep = typeof INGEST_STEPS[number];
export const ingestStepEnum = pgEnum('ingest_step', INGEST_STEPS);

export const INGEST_OUTCOMES = ['deal', 'skipped', 'failed'] as const;
export type IngestOutcome = typeof INGEST_OUTCOMES[number];
export const ingestOutcomeEnum = pgEnum('ingest_outcome', INGEST_OUTCOMES);

/**
 * Every Telegram message the crawler forwards, stored before any processing.
 * It's both the durable inbox (the crawler gets an answer in milliseconds and a
 * crash never loses a message) and the work queue the ingestion worker drains.
 */
export const rawMessagesTable = pgTable('raw_messages', {
  id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  chat: text().notNull(),
  messageId: bigint('message_id', { mode: 'number' }).notNull(),
  /** The crawler's request body, exactly as validated. */
  payload: jsonb().$type<DealPayload>().notNull(),
  /** Telegram photo id, so the (possibly earlier) photo notification can find this row. */
  photoId: text('photo_id'),
  /** Set by the photo notification; used when the deal is created after it arrived. */
  photoPath: text('photo_path'),

  step: ingestStepEnum().notNull().default('extract'),
  /** Final result once step = 'done'. */
  outcome: ingestOutcomeEnum(),
  skipReason: text('skip_reason'),
  dealId: bigint('deal_id', { mode: 'number' }).references(() => dealsTable.id, { onDelete: 'set null' }),
  /** Store ids found by the link pipeline in the extract step, for the resolve step. */
  externalIds: jsonb('external_ids').$type<ExternalId[]>(),

  /** Attempts of the current step; reset when a step completes. */
  attempts: integer().notNull().default(0),
  lastError: text('last_error'),
  /** Retry backoff: the row isn't claimed before this. */
  availableAt: timestamptz('available_at').notNull().defaultNow(),
  /** Lease while a worker runs the step; an expired lease means the worker died. */
  lockedUntil: timestamptz('locked_until'),

  receivedAt: timestamptz('received_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  uniqueIndex('raw_messages_chat_message_uk').on(table.chat, table.messageId),
  index('raw_messages_photo_id_idx').on(table.photoId),
  // The worker's claim query: unfinished rows by step, oldest first.
  index('raw_messages_pending_idx').on(table.step, table.availableAt).where(sql`${table.step} <> 'done'`),
]);

function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true });
}

export type RawMessage = InferSelectModel<typeof rawMessagesTable>;
