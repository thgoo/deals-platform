import { logger } from '../logger';
import { RETRY_PRESETS, withRetry } from '../shared/retry';

type Job = () => Promise<void>;

const CONCURRENCY = 4;
const QUEUE_SIZE_WARN_THRESHOLD = 10;

class DownloadQueue {
  private readonly queue: Job[] = [];
  private activeCount = 0;
  private readonly concurrency: number;

  constructor(concurrency: number) {
    this.concurrency = concurrency;
  }

  enqueue(job: Job): void {
    this.queue.push(job);

    if (this.queue.length > QUEUE_SIZE_WARN_THRESHOLD) {
      logger.warn('Media download queue is growing', {
        queued: this.queue.length,
        active: this.activeCount,
      });
    }

    this.process();
  }

  get size(): number {
    return this.queue.length;
  }

  get active(): number {
    return this.activeCount;
  }

  drain(timeoutMs = 30_000): Promise<void> {
    if (this.activeCount === 0 && this.queue.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        clearInterval(poll);
        reject(new Error(
          `Download queue drain timed out after ${timeoutMs}ms ` +
          `(active = ${this.activeCount}, queued = ${this.queue.length})`,
        ));
      }, timeoutMs);

      const poll = setInterval(() => {
        if (this.activeCount === 0 && this.queue.length === 0) {
          clearInterval(poll);
          clearTimeout(deadline);
          resolve();
        }
      }, 200);
    });
  }

  private process(): void {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) return;

    const job = this.queue.shift();
    if (!job) {
      // Should never happen given the queue.length === 0 guard above,
      // but prevents activeCount from leaking if this code is ever refactored.
      logger.warn('Unexpected empty job in download queue');
      return;
    }

    this.activeCount++;
    logger.debug('Starting media download job', {
      active: this.activeCount,
      queued: this.queue.length,
    });

    withRetry(job, RETRY_PRESETS.FAST)
      .catch((error: unknown) => {
        logger.error('Media download job failed after all retries', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        this.activeCount--;
        logger.debug('Media download job finished', {
          active: this.activeCount,
          queued: this.queue.length,
        });
        this.process();
      });
  }
}

export const downloadQueue = new DownloadQueue(CONCURRENCY);
