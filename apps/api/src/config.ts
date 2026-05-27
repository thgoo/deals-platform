import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters long'),
  WEBHOOK_SECRET: z.string().min(8, 'WEBHOOK_SECRET must be at least 8 characters long'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
  MESSAGING_SERVICE_URL: z.string().url().default('http://localhost:3002'),
  AI_SERVICE_URL: z.string().url().default('http://localhost:3003'),

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
