import type { InferSelectModel } from 'drizzle-orm';
import { bigint, index, jsonb, numeric, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { dealsTable } from './deals';
import { productsTable } from './products';

export const MATCH_METHODS = [
  'url_anchor',
  'embedding_only',
  'llm_judge',
  'created_new',
  'skipped',
] as const;
export type MatchMethod = typeof MATCH_METHODS[number];

export const matchMethodEnum = pgEnum('match_method', MATCH_METHODS);

/**
 * Frozen snapshot of one candidate considered during a match decision.
 * Stored only for audit/debug — the live truth lives in `products`.
 */
export interface CandidateSnapshot {
  productId: string;
  canonicalName: string;
  score: number;
}

/**
 * One row per resolution attempt. Captures *how* a deal was mapped to a product
 * (or wasn't), the candidates considered, and the winning similarity score.
 * Drives threshold calibration and lets us audit/reverse bad matches.
 */
export const productMatchDecisionsTable = pgTable('product_match_decisions', {
  id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  dealId: bigint('deal_id', { mode: 'number' })
    .notNull()
    .references(() => dealsTable.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => productsTable.id),
  method: matchMethodEnum().notNull(),
  topCandidates: jsonb('top_candidates').$type<CandidateSnapshot[]>(),
  similarityScore: numeric('similarity_score', { precision: 5, scale: 4 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index('decisions_deal_idx').on(table.dealId),
  index('decisions_product_idx').on(table.productId),
  index('decisions_method_idx').on(table.method),
  index('decisions_created_at_idx').on(table.createdAt),
]);

export type ProductMatchDecision = InferSelectModel<typeof productMatchDecisionsTable>;
export type NewProductMatchDecision = typeof productMatchDecisionsTable.$inferInsert;
