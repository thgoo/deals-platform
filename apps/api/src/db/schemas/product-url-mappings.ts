import type { InferSelectModel } from 'drizzle-orm';
import { bigint, index, mysqlEnum, mysqlTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/mysql-core';
import { productsTable } from './products';

export const URL_MAPPING_CONFIDENCES = ['llm_high', 'llm_medium', 'manual'] as const;
export type UrlMappingConfidence = typeof URL_MAPPING_CONFIDENCES[number];

/**
 * Maps a retailer-specific external id (ASIN, MLB, Kabum product id, etc.)
 * to a product in our catalog. Filled by the resolver and used as a fast-path
 * lookup before falling back to embedding similarity.
 */
export const productUrlMappingsTable = mysqlTable('product_url_mappings', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  source: varchar({ length: 50 }).notNull(),
  externalId: varchar('external_id', { length: 200 }).notNull(),
  productId: varchar('product_id', { length: 36 })
    .notNull()
    .references(() => productsTable.id),
  confidence: mysqlEnum('confidence', URL_MAPPING_CONFIDENCES).default('llm_high').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  sourceExternalUk: uniqueIndex('source_external_uk').on(table.source, table.externalId),
  productIdx: index('product_idx').on(table.productId),
}));

export type ProductUrlMapping = InferSelectModel<typeof productUrlMappingsTable>;
export type NewProductUrlMapping = typeof productUrlMappingsTable.$inferInsert;
