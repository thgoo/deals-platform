import { z } from 'zod';

export const couponSchema = z.object({
  code: z.string(),
  discount: z.string().optional(),
  description: z.string().optional(),
  expiresAt: z.string().optional(),
  url: z.string().optional(),
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
