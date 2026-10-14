import type { InferSelectModel } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid, vector } from 'drizzle-orm/pg-core';
import { ciText } from './types';

/**
 * Identifies which embedding model produced the vector stored alongside.
 * If the model changes, vectors are not interchangeable — this column lets
 * us detect and re-embed mismatched rows.
 */
export const EMBEDDING_MODEL_VERSIONS = {
  OPENAI_TEXT_EMBEDDING_3_SMALL: 'openai/text-embedding-3-small',
} as const;

export type EmbeddingModelVersion = typeof EMBEDDING_MODEL_VERSIONS[keyof typeof EMBEDDING_MODEL_VERSIONS];

export const EMBEDDING_DIMENSIONS = 1536;

export const productsTable = pgTable('products', {
  id: uuid().primaryKey(),
  canonicalName: ciText('canonical_name').notNull(),
  modelKey: text('model_key'),
  category: ciText(),
  embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  embeddingModelVersion: text('embedding_model_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
}, table => [
  index('products_model_key_idx').on(table.modelKey),
  index('products_category_idx').on(table.category),
]);

export type Product = InferSelectModel<typeof productsTable>;
export type NewProduct = typeof productsTable.$inferInsert;
