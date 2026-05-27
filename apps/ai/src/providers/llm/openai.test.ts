import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { AIAPIError } from '~/shared/errors';

// Disable retry delays for tests — execute the operation once with no backoff.
beforeAll(() => {
  mock.module('~/shared/retry', () => ({
    withRetry: async (op: () => Promise<unknown>) => op(),
    RETRY_PRESETS: { AGGRESSIVE: {}, STANDARD: {}, FAST: {} },
  }));
});

const { default: OpenAIProvider } = await import('./openai');

type FetchInit = Parameters<typeof fetch>[1];
interface CapturedRequest { url: string; init: FetchInit }

const baseConfig = {
  apiKey: 'sk-test',
  model: 'gpt-4.1-nano',
  baseUrl: 'https://api.test/v1/chat/completions',
  timeoutMs: 5000,
};

function okResponse(content: string) {
  return new Response(JSON.stringify({
    id: 'x', object: 'chat.completion', created: 0, model: 'm',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function errorResponse(status: number, body = 'error body') {
  return new Response(body, { status });
}

function requireRequest(req: CapturedRequest | null): CapturedRequest {
  if (!req) throw new Error('no request was captured');
  return req;
}

describe('OpenAIProvider', () => {
  const originalFetch = globalThis.fetch;
  let lastRequest: CapturedRequest | null = null;

  beforeEach(() => {
    lastRequest = null;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(handler: () => Promise<Response> | Response) {
    globalThis.fetch = (async (url: string, init: FetchInit) => {
      lastRequest = { url, init };
      return handler();
    }) as typeof fetch;
  }

  test('includes prompt_cache_key in payload when cacheKey option is set', async () => {
    stubFetch(() => okResponse('result'));
    const provider = new OpenAIProvider(baseConfig);
    await provider.chat([{ role: 'user', content: 'hello' }], { cacheKey: 'bargah-extraction' });

    const req = requireRequest(lastRequest);
    const body = JSON.parse(req.init?.body as string);
    expect(body.prompt_cache_key).toBe('bargah-extraction');
  });

  test('omits prompt_cache_key when cacheKey is absent', async () => {
    stubFetch(() => okResponse('result'));
    const provider = new OpenAIProvider(baseConfig);
    await provider.chat([{ role: 'user', content: 'hello' }]);

    const req = requireRequest(lastRequest);
    const body = JSON.parse(req.init?.body as string);
    expect(body.prompt_cache_key).toBeUndefined();
  });

  test('returns content on successful response', async () => {
    stubFetch(() => okResponse('extracted-data'));
    const provider = new OpenAIProvider(baseConfig);
    const result = await provider.chat([{ role: 'user', content: 'x' }]);
    expect(result).toBe('extracted-data');
  });

  test('maps 4xx response to AIAPIError with that status code', async () => {
    stubFetch(() => errorResponse(400, 'bad request'));
    const provider = new OpenAIProvider(baseConfig);
    try {
      await provider.chat([{ role: 'user', content: 'x' }]);
      throw new Error('expected to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AIAPIError);
      expect((error as AIAPIError).statusCode).toBe(400);
    }
  });

  test('maps 5xx response to AIAPIError with that status code', async () => {
    stubFetch(() => errorResponse(503, 'down'));
    const provider = new OpenAIProvider(baseConfig);
    try {
      await provider.chat([{ role: 'user', content: 'x' }]);
      throw new Error('expected to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AIAPIError);
      expect((error as AIAPIError).statusCode).toBe(503);
    }
  });

  test('maps AbortError (timeout) to AIAPIError with status 408', async () => {
    stubFetch(() => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });
    const provider = new OpenAIProvider(baseConfig);
    try {
      await provider.chat([{ role: 'user', content: 'x' }]);
      throw new Error('expected to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AIAPIError);
      expect((error as AIAPIError).statusCode).toBe(408);
    }
  });

  test('maps generic network error to AIAPIError with status 0', async () => {
    stubFetch(() => { throw new Error('ECONNRESET'); });
    const provider = new OpenAIProvider(baseConfig);
    try {
      await provider.chat([{ role: 'user', content: 'x' }]);
      throw new Error('expected to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AIAPIError);
      expect((error as AIAPIError).statusCode).toBe(0);
    }
  });

  test('throws AIAPIError(500) when response has empty content', async () => {
    stubFetch(() => new Response(JSON.stringify({
      id: 'x', object: 'chat.completion', created: 0, model: 'm',
      choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
    }), { status: 200 }));
    const provider = new OpenAIProvider(baseConfig);
    try {
      await provider.chat([{ role: 'user', content: 'x' }]);
      throw new Error('expected to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AIAPIError);
      expect((error as AIAPIError).statusCode).toBe(500);
    }
  });

  test('sends Authorization header with Bearer token', async () => {
    stubFetch(() => okResponse('ok'));
    const provider = new OpenAIProvider(baseConfig);
    await provider.chat([{ role: 'user', content: 'x' }]);

    const req = requireRequest(lastRequest);
    const headers = req.init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test');
  });
});
