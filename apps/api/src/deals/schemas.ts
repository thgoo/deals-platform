import { z } from 'zod';

// Schema para media (opcional)
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

// Schema para cupom
export const couponSchema = z.object({
  code: z.string(),
  discount: z.string().optional(),
  description: z.string().optional(),
  expiresAt: z.string().optional(),
  url: z.string().optional(),
});

// Schema para criar deal (webhook do crawler)
export const createDealSchema = z.object({
  message_id: z.number(),
  chat: z.string().min(1),
  chat_id: z.string().optional(),
  ts: z.string().datetime(),
  text: z.string(),
  links: z.array(z.string().url()).max(5).default([]),
  price: z.number().nullable().optional(),
  coupons: z.array(couponSchema).optional(),
  media: mediaSchema,
  store: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  product: z.string().nullable().optional(),
});

// Schema para atualizar imagem
export const updateImageSchema = z.object({
  photo_id: z.string().min(1),
  local_path: z.string().min(1),
});

// Schema para query params (GET /api/deals)
export const listDealsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(16),
  cursor: z.string().datetime().optional(), // timestamp do último deal carregado
  chat: z.string().optional(),
});
