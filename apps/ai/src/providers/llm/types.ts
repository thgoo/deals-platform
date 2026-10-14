import type { ChatMessage } from '~/shared/types';

export interface ChatOptions {
  responseFormat?: 'json_object';
  temperature?: number;
  maxTokens?: number;
  /** Hint for provider-side prompt caching (currently honored by OpenAI as `prompt_cache_key`). */
  cacheKey?: string;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}
