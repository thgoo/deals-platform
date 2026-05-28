import { z } from 'zod';

export const mediaSchema = z.object({
  type: z.string(),
  photo_id: z.union([z.string(), z.number()]).optional(),
  doc_id: z.number().optional(),
  url: z.string().optional(),
  site_name: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  has_photo: z.boolean().optional(),
  local_path: z.string().optional(),
}).optional();

export const couponSchema = z.object({
  code: z.string(),
  discount: z.string().optional(),
  description: z.string().optional(),
  expiresAt: z.string().optional(),
  url: z.string().optional(),
});

/**
 * Payload sent by the crawler. Everything that requires processing or AI work
 * (link expansion, affiliate rewriting, deal extraction) is performed in core-api
 * — the crawler only ships the raw Telegram message.
 */
export const createDealSchema = z.object({
  message_id: z.number(),
  chat: z.string().min(1),
  chat_id: z.string().optional(),
  ts: z.string().datetime(),
  text: z.string(),
  links: z.array(z.string().url()).max(5).default([]),
  media: mediaSchema,
});

export const updateImageSchema = z.object({
  photo_id: z.string().min(1),
  local_path: z.string().min(1),
});

export const updateLinksSchema = z.object({
  links: z.array(z.string().url()).max(5),
});

// Accepts YYYY-MM-DD or full ISO datetime
const dateStringSchema = z.string().refine(
  v => !isNaN(Date.parse(v)),
  { message: 'Invalid date' },
);

export const listDealsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(16),
  cursor: z.string().datetime().optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),

  search: z.string().min(1).optional(),
  stores: z.string().optional(),
  hasCoupon: z.string().optional(),
}).transform(data => ({
  ...data,
  from: data.from ? new Date(data.from) : undefined,
  to: data.to ? new Date(data.to) : undefined,
  stores: data.stores ? data.stores.split(',').map(s => s.trim()).filter(Boolean) : undefined,
  hasCoupon: data.hasCoupon === 'true' ? true : data.hasCoupon === 'false' ? false : undefined,
}));

export const updateExtractedSchema = z.object({
  text: z.string().min(1),
  description: z.string().nullable(),
  product: z.string().nullable(),
  store: z.string().nullable(),
  price: z.number().nullable(),
  coupons: z.array(couponSchema).nullable(),
  category: z.string().nullable(),
});
