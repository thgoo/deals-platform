import { cosineDistance, sql } from 'drizzle-orm';
import type { Candidate } from '~/products/types';
import db from '~/db';
import { productsTable } from '~/db/schemas/products';

interface SearchOptions {
  topK: number;
}

/**
 * HNSW search breadth. The pgvector default (40) returned a different top-1
 * score for ~1% of queries on the real catalog; at 100, top-1 scores matched an
 * exact scan for every one of 500 sampled products (remaining id differences are
 * ties between products with identical embeddings). Still ~1–2 ms per query.
 */
const HNSW_EF_SEARCH = 100;

/**
 * Nearest products by cosine similarity, from the pgvector HNSW index on
 * products.embedding. Replaces the in-memory cache: no startup load, no RAM per
 * product, and renames / cleanups are visible immediately.
 *
 * Searches the FULL catalog on purpose — no category filter. AI extraction isn't
 * deterministic on categories (the same product often gets two different labels
 * across deals), so filtering by category hid existing products and created
 * duplicates. The AUTO_MATCH threshold (0.95) keeps cross-category false
 * positives out on its own.
 */
export default class CandidateSearchService {
  async findSimilar(query: number[], options: SearchOptions): Promise<Candidate[]> {
    if (query.length === 0 || query.every(x => x === 0)) return [];

    const distance = cosineDistance(productsTable.embedding, query);

    const rows = await db.transaction(async tx => {
      await tx.execute(sql`SET LOCAL hnsw.ef_search = ${sql.raw(String(HNSW_EF_SEARCH))}`);
      return tx
        .select({
          productId: productsTable.id,
          canonicalName: productsTable.canonicalName,
          distance,
        })
        .from(productsTable)
        .orderBy(distance)
        .limit(options.topK);
    });

    // Cosine similarity = 1 − cosine distance (same score the in-memory dot product gave).
    return rows.map(r => ({
      productId: r.productId,
      canonicalName: r.canonicalName,
      score: 1 - Number(r.distance),
    }));
  }
}
