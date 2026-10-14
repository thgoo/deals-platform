import { z } from 'zod';

export const judgeCandidateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  score: z.number().min(0).max(1),
});

export const judgeRequestSchema = z.object({
  newProduct: z.string().min(1),
  candidates: z.array(judgeCandidateSchema).min(1).max(10),
});

export const judgeResponseSchema = z.object({
  matchedId: z.string().nullable(),
});

export type JudgeCandidate = z.infer<typeof judgeCandidateSchema>;
export type JudgeRequest = z.infer<typeof judgeRequestSchema>;
export type JudgeResponse = z.infer<typeof judgeResponseSchema>;
