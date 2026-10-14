import type { EmbeddingProvider, EmbeddingResult } from './types';
import type { EmbeddingRequest, EmbeddingResponse } from '~/shared/types';
import { logger } from '~/logger';
import { AIAPIError } from '~/shared/errors';
import { RETRY_PRESETS, withRetry } from '~/shared/retry';

export interface OpenAIEmbeddingConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

export default class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAIEmbeddingConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
  }

  async embed(texts: string[]): Promise<EmbeddingResult> {
    return withRetry(() => this.callAPI(texts), RETRY_PRESETS.STANDARD);
  }

  private async callAPI(texts: string[]): Promise<EmbeddingResult> {
    const payload: EmbeddingRequest = {
      model: this.model,
      input: texts,
      encoding_format: 'float',
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const suffix = errorBody ? ` - ${errorBody}` : '';
        throw new AIAPIError(
          `OpenAI Embeddings API error (${response.status}): ${response.statusText}${suffix}`,
          response.status,
        );
      }

      const data = await response.json() as EmbeddingResponse;

      if (!data.data || data.data.length === 0) {
        throw new AIAPIError('Empty response from OpenAI Embeddings API', 500);
      }

      // The API may return embeddings out of order; sort by index to preserve input order
      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      const embeddings = sorted.map(item => item.embedding);
      const dimensions = embeddings[0]?.length ?? 0;

      logger.debug('OpenAI embedding usage', {
        model: data.model,
        count: embeddings.length,
        dimensions,
        usage: data.usage,
      });

      return {
        embeddings,
        model: data.model,
        dimensions,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          totalTokens: data.usage.total_tokens,
        },
      };
    } catch (error) {
      if (error instanceof AIAPIError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new AIAPIError(`Request timed out after ${this.timeoutMs}ms`, 408);
      }
      throw new AIAPIError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        0,
        error instanceof Error ? error : undefined,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
