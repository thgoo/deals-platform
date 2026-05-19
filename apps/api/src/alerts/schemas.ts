import { z } from 'zod';

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const createAlertSchema = z.object({
  keyword: z.string().min(2).max(255).trim(),
  subscription: pushSubscriptionSchema,
});

export const getAlertsQuerySchema = z.object({
  ids: z.string().min(1),
});
