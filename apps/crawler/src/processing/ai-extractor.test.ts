import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';

// Must mock before importing the module under test so the hoisted import
// of withRetry picks up the no-delay version.
mock.module('../shared/retry', () => ({
  RETRY_PRESETS: {
    STANDARD: { maxAttempts: 3, initialDelayMs: 0, maxDelayMs: 0, backoffMultiplier: 1 },
  },
  withRetry: async (
    operation: () => Promise<unknown>,
    _config: unknown,
    isRetryable: ((e: unknown) => boolean) | undefined,
  ) => {
    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        const retryable = isRetryable ? isRetryable(error) : true;
        if (!retryable || attempt === maxAttempts) throw error;
      }
    }
    throw lastError;
  },
}));

const { aiExtractor } = await import('./ai-extractor');

const VALID_RESPONSE = {
  price: 99.9,
  coupons: ['PROMO10'],
  product: 'Tênis Nike Air Max',
  store: 'Amazon',
  description: 'Tênis esportivo masculino',
  productKey: 'tenis-nike-air-max',
  category: 'Calçados',
};

function makeFetch(status: number, body: unknown): typeof fetch {
  return mock(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as unknown as typeof fetch;
}

const CALL_ARGS = ['Tênis Nike em oferta!', 'canal-promo', 1, ['https://amzn.to/abc']] as const;

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('AIExtractor', () => {
  it('returns parsed result on 200 response', async () => {
    globalThis.fetch = makeFetch(200, VALID_RESPONSE);
    const result = await aiExtractor.extract(...CALL_ARGS);
    expect(result.price).toBe(99.9);
    expect(result.product).toBe('Tênis Nike Air Max');
    expect(result.store).toBe('Amazon');
    expect(result.coupons).toEqual(['PROMO10']);
    expect(result.productKey).toBe('tenis-nike-air-max');
    expect(result.category).toBe('Calçados');
  });

  it('defaults coupons to [] when field is absent in response', async () => {
    const { coupons: _, ...withoutCoupons } = VALID_RESPONSE;
    globalThis.fetch = makeFetch(200, withoutCoupons);
    const result = await aiExtractor.extract(...CALL_ARGS);
    expect(result.coupons).toEqual([]);
  });

  it('throws immediately on 4xx without retrying', async () => {
    const fetchMock = makeFetch(400, { error: 'Bad Request' });
    globalThis.fetch = fetchMock;
    await expect(aiExtractor.extract(...CALL_ARGS)).rejects.toThrow('400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and succeeds on second attempt', async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      if (calls < 2) {
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 });
      }
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await aiExtractor.extract(...CALL_ARGS);
    expect(result.price).toBe(99.9);
    expect(calls).toBe(2);
  });

  it('retries on network error and succeeds on second attempt', async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      if (calls < 2) throw new TypeError('fetch failed');
      return new Response(JSON.stringify(VALID_RESPONSE), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await aiExtractor.extract(...CALL_ARGS);
    expect(result.price).toBe(99.9);
    expect(calls).toBe(2);
  });

  it('throws after exhausting all retries on persistent 5xx', async () => {
    globalThis.fetch = makeFetch(503, { error: 'Service Unavailable' });
    await expect(aiExtractor.extract(...CALL_ARGS)).rejects.toThrow('503');
  });

  it('throws after exhausting all retries on persistent network error', async () => {
    globalThis.fetch = mock(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(aiExtractor.extract(...CALL_ARGS)).rejects.toThrow('fetch failed');
  });
});
