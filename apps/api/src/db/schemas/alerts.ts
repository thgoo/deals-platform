import type { InferSelectModel } from 'drizzle-orm';
import { index, int, json, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export const alertsTable = mysqlTable('alerts', {
  id: varchar({ length: 36 }).primaryKey(),
  keyword: varchar({ length: 255 }).notNull(),
  subscription: json().$type<PushSubscription>().notNull(),
  lastNotifiedPrice: int('last_notified_price'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
}, table => ({
  expiresAtIdx: index('expires_at_idx').on(table.expiresAt),
}));

export type Alert = InferSelectModel<typeof alertsTable>;
export type NewAlert = typeof alertsTable.$inferInsert;
