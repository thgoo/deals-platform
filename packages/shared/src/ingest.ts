// Contract between the crawler and the api: what the crawler POSTs to /api/deals
// and /api/deals/image. The api validates with these schemas; the crawler builds
// its payloads from the inferred types.
import { z } from 'zod';

export const mediaSchema = z.object({
  type: z.string(),
  photo_id: z.union([z.string(), z.number()]).optional(),
  document_id: z.string().optional(),
  mime_type: z.string().optional(),
  file_name: z.string().optional(),
  webpage_url: z.string().optional(),
  webpage_title: z.string().optional(),
  webpage_description: z.string().optional(),
  /** Set by older crawler versions that downloaded the photo before posting the deal. */
  local_path: z.string().optional(),
});

export const createDealSchema = z.object({
  message_id: z.number(),
  chat: z.string().min(1),
  chat_id: z.string().optional(),
  ts: z.string().datetime(),
  text: z.string(),
  links: z.array(z.string().url()).max(5).default([]),
  media: mediaSchema.optional(),
});

/** Sent after the crawler finishes downloading a deal's photo. */
export const updateImageSchema = z.object({
  photo_id: z.string().min(1),
  local_path: z.string().min(1),
});

export type MediaPayload = z.input<typeof mediaSchema>;
export type DealPayload = z.input<typeof createDealSchema>;
export type ImagePayload = z.input<typeof updateImageSchema>;
