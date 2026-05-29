import { z } from 'zod';

const positiveInt = (defaultValue: number, max = 365) =>
  z.coerce.number().int().min(1).max(max).default(defaultValue);

export const daysQuerySchema = z.object({
  days: positiveInt(7),
});

export const timeseriesQuerySchema = z.object({
  days: positiveInt(30),
});

export const topQuerySchema = z.object({
  days: positiveInt(7),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const decisionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const priceLeadersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minDeals: z.coerce.number().int().min(2).max(1000).default(10),
});

export const anomaliesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  minDeals: z.coerce.number().int().min(3).max(1000).default(5),
});

export const cleanProductBodySchema = z.object({
  dealIds: z.array(z.number().int().positive()).min(1).max(1000),
});

export const updateDealPriceBodySchema = z.object({
  // Price in cents. Capped high to catch typos but still allow expensive items.
  price: z.number().int().positive().max(100_000_00),
});

export const dealIdParamSchema = z.object({
  dealId: z.coerce.number().int().positive(),
});

export const updateProductNameBodySchema = z.object({
  canonicalName: z.string().trim().min(1).max(500),
});
