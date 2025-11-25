import type { InferSelectModel } from 'drizzle-orm';
import { bigint, index, int, json, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

// Types
export interface Coupon {
  code: string;
  discount?: string;
  description?: string;
  expiresAt?: string;
  url?: string;
}

export const dealsTable = mysqlTable('deals', {
  // IDs
  id: bigint({ mode: 'number', unsigned: true })
    .autoincrement()
    .primaryKey(),
  messageId: bigint('message_id', { mode: 'number' }).notNull(),

  // Chat info
  chat: varchar({ length: 255 }).notNull(),
  chatId: varchar('chat_id', { length: 255 }),

  // Message content
  ts: timestamp().notNull(), // Timestamp da mensagem original
  text: text().notNull(),
  links: json().$type<string[]>().notNull().default([]),

  // Deal value
  price: int(),
  coupons: json().$type<Coupon[]>(),

  // AI-extracted fields
  store: varchar({ length: 255 }),
  description: text(),
  product: varchar({ length: 500 }),

  // Media info
  mediaType: varchar('media_type', { length: 50 }),
  photoId: varchar('photo_id', { length: 255 }),
  localPath: varchar('local_path', { length: 500 }),

  // Metadata
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  // Índices para queries comuns
  chatIdx: index('chat_idx').on(table.chat),
  tsIdx: index('ts_idx').on(table.ts),
  photoIdIdx: index('photo_id_idx').on(table.photoId),
  // Índice único para evitar duplicatas
  chatMessageIdx: index('chat_message_idx').on(table.chat, table.messageId),
  // Índice para filtro por loja
  storeIdx: index('store_idx').on(table.store),
}));

export type Deal = InferSelectModel<typeof dealsTable>;
export type NewDeal = typeof dealsTable.$inferInsert;
