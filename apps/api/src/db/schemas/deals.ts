import type { InferSelectModel } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { productsTable } from './products';
import { ciText } from './types';

export interface Coupon {
  code: string;
  discount?: string;
  description?: string;
  expiresAt?: string;
  url?: string;
}

export const dealsTable = pgTable('deals', {
  // "by default" so the MariaDB copy can keep the existing ids.
  id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  messageId: bigint('message_id', { mode: 'number' }).notNull(),
  chat: text().notNull(),
  chatId: text('chat_id'),
  ts: timestamp({ withTimezone: true }).notNull(),
  text: ciText().notNull(),
  links: jsonb().$type<string[]>().notNull().default([]),
  /** Price in cents. */
  price: integer(),
  coupons: jsonb().$type<Coupon[]>(),
  store: ciText(),
  description: ciText(),
  product: ciText(),
  category: ciText(),
  mediaType: text('media_type'),
  photoId: text('photo_id'),
  localPath: text('local_path'),
  productId: uuid('product_id').references(() => productsTable.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  // One row per Telegram message: makes ingestion idempotent under retries.
  uniqueIndex('deals_chat_message_uk').on(table.chat, table.messageId),
  index('deals_ts_idx').on(table.ts),
  index('deals_photo_id_idx').on(table.photoId),
  index('deals_store_idx').on(table.store),
  index('deals_category_idx').on(table.category),
  index('deals_product_id_idx').on(table.productId),
]);

export type Deal = InferSelectModel<typeof dealsTable>;
export type NewDeal = typeof dealsTable.$inferInsert;
