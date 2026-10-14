import { describe, expect, test } from 'bun:test';
import { AIAPIError, AIParsingError } from './errors';
import { type RetryConfig, withRetry } from './retry';

const INSTANT: Partial<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 0,
  maxDelayMs: 0,
  backoffMultiplier: 1,
};

describe('withRetry', () => {
  test('returns result immediately on success', async () => {
    const result = await withRetry(() => Promise.resolve(42), INSTANT);
    expect(result).toBe(42);
  });

  test('retries on server error (5xx) and eventually succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      if (++calls < 3) throw new AIAPIError('Server error', 500);
      return 'ok';
    }, INSTANT);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  test('throws immediately on non-retryable client error (4xx)', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new AIAPIError('Bad request', 400); }, INSTANT),
    ).rejects.toBeInstanceOf(AIAPIError);
    expect(calls).toBe(1);
  });

  test('throws immediately on parsing error (not retryable)', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new AIParsingError('Bad JSON'); }, INSTANT),
    ).rejects.toBeInstanceOf(AIParsingError);
    expect(calls).toBe(1);
  });

  test('retries on timeout (408) up to max attempts', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new AIAPIError('Timeout', 408); }, INSTANT),
    ).rejects.toBeInstanceOf(AIAPIError);
    expect(calls).toBe(3);
  });

  test('retries on rate limit (429) up to max attempts', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new AIAPIError('Rate limited', 429); }, INSTANT),
    ).rejects.toBeInstanceOf(AIAPIError);
    expect(calls).toBe(3);
  });

  test('retries on network error (statusCode 0) up to max attempts', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new AIAPIError('Network error', 0); }, INSTANT),
    ).rejects.toBeInstanceOf(AIAPIError);
    expect(calls).toBe(3);
  });

  test('throws the last error after exhausting all attempts', async () => {
    const err = new AIAPIError('Persistent server error', 503);
    await expect(withRetry(async () => { throw err; }, INSTANT)).rejects.toBe(err);
  });
});
