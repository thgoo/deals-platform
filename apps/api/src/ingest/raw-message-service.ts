import type { DealPayload } from '@bargah/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { EventEmitter } from 'events';
import type { IngestStep, RawMessage } from '~/db/schemas/raw-messages';
import type { ExternalId } from '~/link-pipeline/types';
import db from '~/db';
import { rawMessagesTable } from '~/db/schemas/raw-messages';

/** How long a claimed step may run before another worker may take it over. */
const LEASE_SECONDS = 300;

/** Retry delay after the Nth failed attempt: 30 s, 1 min, 2 min, 4 min, … capped at 15 min. */
export function backoffSeconds(attempt: number): number {
  return Math.min(30 * 2 ** (attempt - 1), 900);
}

/**
 * The raw-message inbox and work queue (see raw_messages). Rows are claimed
 * with FOR UPDATE SKIP LOCKED plus a lease, so any number of workers can drain
 * it safely and a crashed worker's row becomes claimable again.
 */
export default class RawMessageService {
  /** Emits 'queued' when a new message arrives, so an idle worker wakes up at once. */
  readonly events = new EventEmitter();

  /** Stores a message from the crawler. Returns null if it was already received. */
  async receive(payload: DealPayload): Promise<RawMessage | null> {
    const photoId = payload.media?.photo_id;
    const [row] = await db.insert(rawMessagesTable)
      .values({
        chat: payload.chat,
        messageId: payload.message_id,
        payload,
        photoId: photoId === undefined ? null : String(photoId),
      })
      .onConflictDoNothing({ target: [rawMessagesTable.chat, rawMessagesTable.messageId] })
      .returning();

    if (row) this.events.emit('queued', row.id);
    return row ?? null;
  }

  /** Claims the oldest available row at `step`, or returns null when there is none. */
  async claim(step: IngestStep): Promise<RawMessage | null> {
    const [row] = await db.execute<{ id: string }>(sql`
      UPDATE raw_messages
      SET locked_until = now() + make_interval(secs => ${LEASE_SECONDS}),
          attempts = attempts + 1,
          updated_at = now()
      WHERE id = (
        SELECT id FROM raw_messages
        WHERE step = ${step}
          AND available_at <= now()
          AND (locked_until IS NULL OR locked_until < now())
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id
    `);
    if (!row) return null;
    return this.findById(Number(row.id));
  }

  async findById(id: number): Promise<RawMessage | null> {
    const [row] = await db.select().from(rawMessagesTable).where(eq(rawMessagesTable.id, id));
    return row ?? null;
  }

  /** Moves the row to the next step (or finishes it) and releases the lease. */
  async advance(
    id: number,
    next: IngestStep,
    fields: { dealId?: number; externalIds?: ExternalId[]; outcome?: 'deal' } = {},
  ): Promise<void> {
    await db.update(rawMessagesTable)
      .set({
        step: next,
        attempts: 0,
        lastError: null,
        lockedUntil: null,
        availableAt: new Date(),
        ...fields,
      })
      .where(eq(rawMessagesTable.id, id));
  }

  /** Finishes the row without a deal (noise, not a deal, already ingested, …). */
  async skip(id: number, reason: string, dealId?: number): Promise<void> {
    await db.update(rawMessagesTable)
      .set({ step: 'done', outcome: 'skipped', skipReason: reason, lockedUntil: null, dealId })
      .where(eq(rawMessagesTable.id, id));
  }

  /**
   * Records a failed attempt: retried after a backoff, or marked failed for good
   * after `maxAttempts` (or immediately when `permanent`).
   */
  async fail(row: RawMessage, error: string, maxAttempts: number, permanent = false): Promise<'retry' | 'failed'> {
    if (permanent || row.attempts >= maxAttempts) {
      await db.update(rawMessagesTable)
        .set({ step: 'done', outcome: 'failed', lastError: error, lockedUntil: null })
        .where(eq(rawMessagesTable.id, row.id));
      return 'failed';
    }
    await db.update(rawMessagesTable)
      .set({
        lastError: error,
        lockedUntil: null,
        availableAt: new Date(Date.now() + backoffSeconds(row.attempts) * 1000),
      })
      .where(eq(rawMessagesTable.id, row.id));
    return 'retry';
  }

  /**
   * Records a photo that finished downloading on its raw message, so a deal
   * created after this point starts with the photo. (A deal that already exists
   * is updated by the caller.)
   */
  async attachPhoto(photoId: string, localPath: string): Promise<void> {
    await db.update(rawMessagesTable)
      .set({ photoPath: localPath })
      .where(and(eq(rawMessagesTable.photoId, photoId), isNull(rawMessagesTable.photoPath)));
  }

  /** Puts failed messages back at the start of the pipeline. Returns how many. */
  async requeueFailed(since?: Date): Promise<number> {
    const rows = await db.update(rawMessagesTable)
      .set({ step: 'extract', outcome: null, attempts: 0, lastError: null, availableAt: new Date(), lockedUntil: null })
      .where(and(
        eq(rawMessagesTable.outcome, 'failed'),
        since ? sql`${rawMessagesTable.receivedAt} >= ${since}` : undefined,
      ))
      .returning({ id: rawMessagesTable.id });
    if (rows.length > 0) this.events.emit('queued');
    return rows.length;
  }
}
