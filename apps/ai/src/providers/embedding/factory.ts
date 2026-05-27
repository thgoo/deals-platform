import type { EmbeddingProvider } from './types';
import { config } from '~/config';
import OpenAIEmbeddingProvider from './openai';

const EMBEDDING_PROVIDER = 'openai';

export function createEmbeddingProvider(): EmbeddingProvider {
  if (!config.OPENAI_API_KEY) {
    throw new Error('Missing environment variable: OPENAI_API_KEY (required for embeddings)');
  }
  return new OpenAIEmbeddingProvider({
    apiKey: config.OPENAI_API_KEY,
    model: config.OPENAI_EMBEDDING_MODEL,
    baseUrl: config.OPENAI_EMBEDDING_BASE_URL,
    timeoutMs: config.OPENAI_EMBEDDING_TIMEOUT_MS,
  });
}

export function getActiveEmbeddingProviderName(): string {
  return EMBEDDING_PROVIDER;
}
