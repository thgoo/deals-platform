import { logger } from '~/logger';
import { AIAPIError } from './errors';

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof AIAPIError)) return false;
  const { statusCode } = error;
  if (statusCode == null) return false;
  return statusCode === 0 || statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode < 600);
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  return Math.min(config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1), config.maxDelayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === finalConfig.maxAttempts) {
        throw error;
      }

      const delay = calculateDelay(attempt, finalConfig);
      logger.warn('Operation failed, retrying', {
        attempt,
        maxAttempts: finalConfig.maxAttempts,
        delayMs: delay,
        error: error instanceof Error ? error.message : String(error),
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

export const RETRY_PRESETS = {
  FAST: {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  } as RetryConfig,

  STANDARD: DEFAULT_RETRY_CONFIG,

  AGGRESSIVE: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 16000,
    backoffMultiplier: 2,
  } as RetryConfig,
} as const;
