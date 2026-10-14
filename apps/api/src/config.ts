import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters long'),
  WEBHOOK_SECRET: z.string().min(8, 'WEBHOOK_SECRET must be at least 8 characters long'),
  DASHBOARD_SECRET: z.string().min(16, 'DASHBOARD_SECRET must be at least 16 characters long'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  // Web Push (alerts). Generate a pair with: bunx web-push generate-vapid-keys
  VAPID_EMAIL: z.string().min(1),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),

  // AI (extraction, embeddings, match judge). Keys are checked when a provider is
  // first used, so processes that never call the AI (tests, most scripts) don't need them.
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

  // Affiliate programs — all optional. Absent key = that store's rewriter is a no-op.
  AMAZON_AFFILIATE_TAG: z.string().optional(),
  MERCADOLIVRE_AFFILIATE_ID: z.string().optional(),
  NATURA_AFFILIATE_ID: z.string().optional(),
  MAGALU_AFFILIATE_ID: z.string().optional(),
  MAGALU_PROMOTER_ID: z.string().optional(),
  SHOPEE_APP_ID: z.string().optional(),
  SHOPEE_SECRET: z.string().optional(),
  ALIEXPRESS_APP_KEY: z.string().optional(),
  ALIEXPRESS_APP_SECRET: z.string().optional(),
  ALIEXPRESS_TRACKING_ID: z.string().optional(),
  AWIN_PUBLISHER_ID: z.string().optional(),
  AWIN_TOKEN: z.string().optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  throw new Error('Invalid environment variables: ' + JSON.stringify(result.error.flatten().fieldErrors));
}

export const config = result.data;
