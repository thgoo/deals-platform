import type { InferSelectModel } from 'drizzle-orm';
import { bigint, index, int, json, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { productsTable } from './products';

export interface Coupon {
  code: string;
  discount?: string;
  description?: string;
  expiresAt?: string;
  url?: string;
}

export const dealsTable = mysqlTable('deals', {
  id: bigint({ mode: 'number', unsigned: true })
    .autoincrement()
    .primaryKey(),
  messageId: bigint('message_id', { mode: 'number' }).notNull(),
  chat: varchar({ length: 255 }).notNull(),
  chatId: varchar('chat_id', { length: 255 }),
  ts: timestamp().notNull(),
  text: text().notNull(),
  links: json().$type<string[]>().notNull().default([]),
  price: int(),
  coupons: json().$type<Coupon[]>(),
  store: varchar({ length: 255 }),
  description: text(),
  product: varchar({ length: 500 }),
  category: varchar({ length: 50 }),
  mediaType: varchar('media_type', { length: 50 }),
  photoId: varchar('photo_id', { length: 255 }),
  localPath: varchar('local_path', { length: 500 }),
  productId: varchar('product_id', { length: 36 })
    .references(() => productsTable.id),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  chatIdx: index('chat_idx').on(table.chat),
  tsIdx: index('ts_idx').on(table.ts),
  photoIdIdx: index('photo_id_idx').on(table.photoId),
  chatMessageIdx: index('chat_message_idx').on(table.chat, table.messageId),
  storeIdx: index('store_idx').on(table.store),
  categoryIdx: index('category_idx').on(table.category),
  productIdx: index('product_id_idx').on(table.productId),
}));

export type Deal = InferSelectModel<typeof dealsTable>;
export type NewDeal = typeof dealsTable.$inferInsert;
