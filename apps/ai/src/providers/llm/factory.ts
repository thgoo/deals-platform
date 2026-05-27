import type { LLMProvider } from './types';
import { config } from '~/config';
import AbacusProvider from './abacus';
import OpenAIProvider from './openai';

export function createLLMProvider(name: string): LLMProvider {
  switch (name) {
    case 'abacus': {
      if (!config.ABACUS_API_KEY) {
        throw new Error('Missing environment variable: ABACUS_API_KEY');
      }
      return new AbacusProvider({
        apiKey: config.ABACUS_API_KEY,
        model: config.ABACUS_MODEL,
        baseUrl: config.ABACUS_BASE_URL,
        timeoutMs: config.ABACUS_TIMEOUT_MS,
      });
    }
    case 'openai': {
      if (!config.OPENAI_API_KEY) {
        throw new Error('Missing environment variable: OPENAI_API_KEY');
      }
      return new OpenAIProvider({
        apiKey: config.OPENAI_API_KEY,
        model: config.OPENAI_LLM_MODEL,
        baseUrl: config.OPENAI_LLM_BASE_URL,
        timeoutMs: config.OPENAI_LLM_TIMEOUT_MS,
      });
    }
    default:
      throw new Error(`Unsupported LLM provider: "${name}". Supported: abacus, openai`);
  }
}
