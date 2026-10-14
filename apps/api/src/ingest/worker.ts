import { ZodError } from 'zod';
import type IngestPipeline from './pipeline';
import type RawMessageService from './raw-message-service';
import type { IngestStep } from '~/db/schemas/raw-messages';
import type { Logger } from '~/logger';

/** Attempts per step before a message is marked failed (requeue with scripts/requeue-failed.ts). */
const MAX_ATTEMPTS: Record<Exclude<IngestStep, 'done'>, number> = {
  extract: 6, // ~30 min of backoff: rides out an AI provider outage
  resolve: 6,
  notify: 3,
};

/** How long an idle loop sleeps before polling again (a new message wakes it sooner). */
const IDLE_POLL_MS = 5_000;

interface Lane {
  name: string;
  /** Steps this lane runs, in priority order. */
  steps: Exclude<IngestStep, 'done'>[];
  concurrency: number;
}

/**
 * Drains raw_messages through the pipeline. Two lanes:
 *  - extract: 3 at a time (AI calls are slow but independent);
 *  - resolve + notify: one at a time, so product matching is serialized — two
 *    deals for the same new product can't both create it.
 * Runs inside the api process; safe to run in several processes too (claims use
 * SKIP LOCKED + a lease).
 */
export default class IngestWorker {
  private running = false;
  private readonly loops: Promise<void>[] = [];
  private readonly wakers = new Set<() => void>();

  constructor(
    private readonly queue: RawMessageService,
    private readonly pipeline: IngestPipeline,
    private readonly logger: Logger,
    private readonly lanes: Lane[] = [
      { name: 'extract', steps: ['extract'], concurrency: 3 },
      { name: 'resolve', steps: ['resolve', 'notify'], concurrency: 1 },
    ],
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.queue.events.on('queued', this.wakeAll);
    for (const lane of this.lanes) {
      for (let i = 0; i < lane.concurrency; i++) {
        this.loops.push(this.loop(lane));
      }
    }
    this.logger.info('Ingestion worker started', {
      lanes: this.lanes.map(l => `${l.name}×${l.concurrency}`).join(', '),
    });
  }

  /** Stops claiming new work and waits for in-flight steps to finish. */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.queue.events.off('queued', this.wakeAll);
    this.wakeAll();
    await Promise.all(this.loops);
    this.loops.length = 0;
  }

  /** Runs every available step once, without the loops (tests, scripts). */
  async drain(): Promise<number> {
    let processed = 0;
    for (;;) {
      let didWork = false;
      for (const lane of this.lanes) {
        for (const step of lane.steps) {
          if (await this.runOne(step)) {
            processed++;
            didWork = true;
          }
        }
      }
      if (!didWork) return processed;
    }
  }

  private async loop(lane: Lane): Promise<void> {
    while (this.running) {
      let didWork = false;
      for (const step of lane.steps) {
        if (!this.running) break;
        try {
          if (await this.runOne(step)) {
            didWork = true;
            break; // re-check higher-priority steps first
          }
        } catch (err) {
          // Queue bookkeeping itself failed (e.g. database down). Back off.
          this.logger.error('Ingestion worker error', { lane: lane.name, error: errorMessage(err) });
          await this.sleep(IDLE_POLL_MS);
        }
      }
      if (!didWork) await this.sleep(IDLE_POLL_MS);
    }
  }

  /** Claims and runs one row at `step`. Returns false when there was nothing to do. */
  private async runOne(step: Exclude<IngestStep, 'done'>): Promise<boolean> {
    const row = await this.queue.claim(step);
    if (!row) return false;

    try {
      const result = await this.pipeline.run(step, row);
      if (result.kind === 'skip') {
        await this.queue.skip(row.id, result.reason, result.dealId);
      } else {
        await this.queue.advance(row.id, result.next, {
          dealId: result.dealId,
          externalIds: result.externalIds,
          outcome: result.outcome,
        });
      }
    } catch (err) {
      // Invalid input never gets better on retry.
      const permanent = err instanceof ZodError;
      const verdict = await this.queue.fail(row, errorMessage(err), MAX_ATTEMPTS[step], permanent);
      const meta = { rawId: row.id, step, attempt: row.attempts, error: errorMessage(err) };
      if (verdict === 'failed') this.logger.error('Ingestion step failed for good', meta);
      else this.logger.warn('Ingestion step failed, will retry', meta);
    }
    return true;
  }

  private readonly wakeAll = (): void => {
    for (const wake of this.wakers) wake();
    this.wakers.clear();
  };

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        this.wakers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.wakers.add(done);
    });
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
