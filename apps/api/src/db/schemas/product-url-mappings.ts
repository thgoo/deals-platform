import type { InferSelectModel } from 'drizzle-orm';
import { bigint, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { productsTable } from './products';

export const URL_MAPPING_CONFIDENCES = ['llm_high', 'llm_medium', 'manual'] as const;
export type UrlMappingConfidence = typeof URL_MAPPING_CONFIDENCES[number];

export const urlMappingConfidenceEnum = pgEnum('url_mapping_confidence', URL_MAPPING_CONFIDENCES);

/**
 * Maps a retailer-specific external id (ASIN, MLB, Kabum product id, etc.)
 * to a product in our catalog. Filled by the resolver and used as a fast-path
 * lookup before falling back to embedding similarity.
 */
export const productUrlMappingsTable = pgTable('product_url_mappings', {
  id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  source: text().notNull(),
  externalId: text('external_id').notNull(),
  productId: uuid('product_id')
    .notNull()
    .references(() => productsTable.id),
  confidence: urlMappingConfidenceEnum().default('llm_high').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex('mappings_source_external_uk').on(table.source, table.externalId),
  index('mappings_product_idx').on(table.productId),
]);

export type ProductUrlMapping = InferSelectModel<typeof productUrlMappingsTable>;
export type NewProductUrlMapping = typeof productUrlMappingsTable.$inferInsert;
