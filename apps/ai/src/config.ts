import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3003),
  LOG_LEVEL: z.string().optional(),

  LLM_PROVIDER: z.enum(['abacus', 'openai']).default('abacus'),
  ABACUS_API_KEY: z.string().optional(),
  ABACUS_MODEL: z.string().default('claude-3-7-sonnet-20250219'),
  ABACUS_TIMEOUT_MS: z.coerce.number().default(30000),
  ABACUS_BASE_URL: z.url().default('https://routellm.abacus.ai/v1/chat/completions'),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_LLM_MODEL: z.string().default('gpt-4.1-nano'),
  OPENAI_LLM_TIMEOUT_MS: z.coerce.number().default(30000),
  OPENAI_LLM_BASE_URL: z.url().default('https://api.openai.com/v1/chat/completions'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_EMBEDDING_TIMEOUT_MS: z.coerce.number().default(30000),
  OPENAI_EMBEDDING_BASE_URL: z.url().default('https://api.openai.com/v1/embeddings'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  throw new Error('Invalid environment variables: ' + JSON.stringify(result.error.flatten().fieldErrors));
}

export const config = result.data;
