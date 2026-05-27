import type { ChatOptions, LLMProvider } from './types';
import type { ChatCompletionRequest, ChatCompletionResponse, ChatMessage } from '~/shared/types';
import { AIAPIError } from '~/shared/errors';
import { RETRY_PRESETS, withRetry } from '~/shared/retry';

export interface AbacusProviderConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

export default class AbacusProvider implements LLMProvider {
  readonly name = 'abacus';
  readonly model: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: AbacusProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.timeoutMs = config.timeoutMs;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    return withRetry(() => this.callAPI(messages, options), RETRY_PRESETS.AGGRESSIVE);
  }

  private async callAPI(messages: ChatMessage[], options: ChatOptions): Promise<string> {
    const payload: ChatCompletionRequest = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.responseFormat && { response_format: { type: options.responseFormat } }),
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
          `Abacus API error (${response.status}): ${response.statusText}${suffix}`,
          response.status,
        );
      }

      const data = await response.json() as ChatCompletionResponse;
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new AIAPIError('Empty response from Abacus API', 500);
      }

      return content;
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
