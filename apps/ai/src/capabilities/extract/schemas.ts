import { z } from 'zod';
import type { Category } from '~/constants/categories';
import { CATEGORIES } from '~/constants/categories';

export const extractRequestSchema = z.object({
  text: z.string().min(1, 'Text is required'),
  chat: z.string().min(1, 'Chat is required'),
  messageId: z.number().int().positive(),
  links: z.array(z.url()).default([]),
});

export const couponSchema = z.object({
  code: z.string(),
  discount: z.string().nullable().transform((val): string | undefined => val ?? undefined),
});

export const extractionSchema = z.object({
  text: z.string(),
  description: z.string().nullable(),
  product: z.string().nullable(),
  store: z.string().nullable(),
  price: z.number().transform(Math.round).nullable(),
  coupons: z.array(couponSchema).default([]),
  category: z.string().nullable().transform((val): Category | null => {
    if (val === null) return null;
    if ((CATEGORIES as readonly string[]).includes(val)) return val as Category;
    return 'others';
  }),
});

export type ExtractRequest = z.infer<typeof extractRequestSchema>;
export type ExtractResponse = z.infer<typeof extractionSchema>;
export type Coupon = z.infer<typeof couponSchema>;
export type { Category } from '~/constants/categories';
