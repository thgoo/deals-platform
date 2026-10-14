import type { InferSelectModel } from 'drizzle-orm';
import { index, json, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';

/**
 * Identifies which embedding model produced the vector stored alongside.
 * If the model changes, vectors are not interchangeable — this column lets
 * us detect and re-embed mismatched rows.
 */
export const EMBEDDING_MODEL_VERSIONS = {
  OPENAI_TEXT_EMBEDDING_3_SMALL: 'openai/text-embedding-3-small',
} as const;

export type EmbeddingModelVersion = typeof EMBEDDING_MODEL_VERSIONS[keyof typeof EMBEDDING_MODEL_VERSIONS];

export const productsTable = mysqlTable('products', {
  id: varchar({ length: 36 }).primaryKey(),
  canonicalName: varchar('canonical_name', { length: 500 }).notNull(),
  modelKey: varchar('model_key', { length: 200 }),
  category: varchar({ length: 50 }),
  embedding: json().$type<number[]>().notNull(),
  embeddingModelVersion: varchar('embedding_model_version', { length: 100 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().onUpdateNow(),
}, table => ({
  modelKeyIdx: index('model_key_idx').on(table.modelKey),
  categoryIdx: index('category_idx').on(table.category),
}));

export type Product = InferSelectModel<typeof productsTable>;
export type NewProduct = typeof productsTable.$inferInsert;
