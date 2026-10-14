import { z } from 'zod';

export const embedRequestSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(100),
});

export const embedResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  model: z.string(),
  dimensions: z.number(),
  usage: z.object({
    promptTokens: z.number(),
    totalTokens: z.number(),
  }),
});

export type EmbedRequest = z.infer<typeof embedRequestSchema>;
export type EmbedResponse = z.infer<typeof embedResponseSchema>;
