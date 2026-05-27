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

export const duplicatesQuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(1).default(0.85),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const decisionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
