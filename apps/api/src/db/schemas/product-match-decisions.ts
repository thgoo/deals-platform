import type { InferSelectModel } from 'drizzle-orm';
import { bigint, decimal, index, json, mysqlEnum, mysqlTable, timestamp, varchar } from 'drizzle-orm/mysql-core';
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
export const productMatchDecisionsTable = mysqlTable('product_match_decisions', {
  id: bigint({ mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  dealId: bigint('deal_id', { mode: 'number', unsigned: true })
    .notNull()
    .references(() => dealsTable.id),
  productId: varchar('product_id', { length: 36 })
    .references(() => productsTable.id),
  method: mysqlEnum('method', MATCH_METHODS).notNull(),
  topCandidates: json('top_candidates').$type<CandidateSnapshot[]>(),
  similarityScore: decimal('similarity_score', { precision: 5, scale: 4 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, table => ({
  dealIdx: index('deal_idx').on(table.dealId),
  productIdx: index('product_idx').on(table.productId),
  methodIdx: index('method_idx').on(table.method),
}));

export type ProductMatchDecision = InferSelectModel<typeof productMatchDecisionsTable>;
export type NewProductMatchDecision = typeof productMatchDecisionsTable.$inferInsert;
