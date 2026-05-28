import type { Coupon } from '~/db/schemas/deals';
import { config } from '~/config';
import { logger } from '~/logger';

// Long enough to cover the ai-service's internal retry budget (STANDARD preset:
// up to 3 attempts × ~30s each + delays ≈ 93s worst case). If we time out before
// ai-service finishes its retries, we'd drop the deal on a transient blip the
// retries would otherwise heal.
const REQUEST_TIMEOUT_MS = 120_000;

export interface EmbedResponse {
  embeddings: number[][];
  model: string;
  dimensions: number;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface JudgeCandidate {
  id: string;
  name: string;
  score: number;
}

export interface JudgeResponse {
  matchedId: string | null;
}

export interface ExtractRequest {
  text: string;
  chat: string;
  messageId: number;
  links: string[];
}

export interface ExtractResponse {
  text: string;
  description: string | null;
  product: string | null;
  store: string | null;
  price: number | null;
  coupons: Coupon[];
  category: string | null;
}

export class AiServiceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AiServiceError';
  }
}

/**
 * HTTP client for the ai-service. Wraps fetch with timeout and surfaces
 * upstream errors as AiServiceError so callers can decide how to fall back.
 */
export default class AiServiceClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = config.AI_SERVICE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async embed(texts: string[]): Promise<EmbedResponse> {
    return this.post<EmbedResponse>('/api/ai/embed', { texts });
  }

  async judge(newProduct: string, candidates: JudgeCandidate[]): Promise<JudgeResponse> {
    return this.post<JudgeResponse>('/api/ai/judge', { newProduct, candidates });
  }

  async extract(input: ExtractRequest): Promise<ExtractResponse> {
    return this.post<ExtractResponse>('/api/ai/extract', input);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const suffix = errorBody ? ` — ${errorBody}` : '';
        throw new AiServiceError(
          `ai-service ${path} returned ${response.status}: ${response.statusText}${suffix}`,
        );
      }

      return await response.json() as T;
    } catch (error) {
      if (error instanceof AiServiceError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new AiServiceError(`ai-service ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      const message = error instanceof Error ? error.message : String(error);
      logger.error('ai-service request failed', { path, error: message });
      throw new AiServiceError(`ai-service ${path} request failed: ${message}`, error);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
