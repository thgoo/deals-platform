import { logger } from '../logger';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  backoffMultiplier: 3,
};

export const RETRY_PRESETS = {
  /** 3 attempts: 0s -> 500ms → 1s */
  FAST: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  } as RetryConfig,

  /** 3 attempts: 0s → 1s → 3s */
  STANDARD: DEFAULT_CONFIG,

  /** 5 attempts: 0s -> 1s → 2s → 4s → 8s  */
  AGGRESSIVE: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  } as RetryConfig,
} as const;

function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  return Math.min(delay, config.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retries an async operation with exponential backoff.
 *
 * By default, retries on any error. Pass `isRetryable` to restrict
 * which errors should trigger a retry (e.g. skip 4xx client errors).
 *
 * @throws The last error if all attempts are exhausted.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  isRetryable: (error: unknown) => boolean = () => true,
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryable(error) || attempt === finalConfig.maxAttempts) {
        throw error;
      }

      const delay = calculateDelay(attempt, finalConfig);
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn('Operation failed, retrying', {
        attempt,
        maxAttempts: finalConfig.maxAttempts,
        delayMs: delay,
        error: errorMsg,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}
