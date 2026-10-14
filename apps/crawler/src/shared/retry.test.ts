import { describe, expect, it, mock } from 'bun:test';
import { withRetry } from './retry';

const NO_DELAY: import('./retry').RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 0,
  maxDelayMs: 0,
  backoffMultiplier: 1,
};

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const operation = mock(async () => 'ok');
    const result = await withRetry(operation, NO_DELAY);
    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on second attempt', async () => {
    let calls = 0;
    const operation = mock(async () => {
      calls++;
      if (calls < 2) throw new Error('transient');
      return 'ok';
    });
    const result = await withRetry(operation, NO_DELAY);
    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all attempts', async () => {
    const operation = mock(async () => { throw new Error('permanent'); });
    await expect(withRetry(operation, NO_DELAY)).rejects.toThrow('permanent');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry when isRetryable returns false', async () => {
    const operation = mock(async () => { throw new Error('client error'); });
    const isRetryable = () => false;
    await expect(withRetry(operation, NO_DELAY, isRetryable)).rejects.toThrow('client error');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('only retries when isRetryable returns true', async () => {
    let calls = 0;
    const operation = mock(async () => {
      calls++;
      const err = Object.assign(new Error('server error'), { statusCode: calls < 3 ? 503 : 200 });
      if (calls < 3) throw err;
      return 'ok';
    });
    const isRetryable = (e: unknown) => (e as { statusCode?: number }).statusCode === 503;
    const result = await withRetry(operation, NO_DELAY, isRetryable);
    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry 4xx errors (isRetryable = false for client errors)', async () => {
    const operation = mock(async () => {
      throw Object.assign(new Error('bad request'), { statusCode: 400 });
    });
    const isRetryable = (e: unknown) => {
      const status = (e as { statusCode?: number }).statusCode;
      return status === undefined || status >= 500;
    };
    await expect(withRetry(operation, NO_DELAY, isRetryable)).rejects.toThrow('bad request');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
