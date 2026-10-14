import type { InferSelectModel } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export const alertsTable = pgTable('alerts', {
  id: uuid().primaryKey(),
  keyword: text().notNull(),
  subscription: jsonb().$type<PushSubscription>().notNull(),
  lastNotifiedPrice: integer('last_notified_price'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, table => [
  index('alerts_expires_at_idx').on(table.expiresAt),
]);

export type Alert = InferSelectModel<typeof alertsTable>;
export type NewAlert = typeof alertsTable.$inferInsert;
