import type ProductService from './product-service';
import type { Product } from '~/db/schemas/products';
import type { Logger } from '~/logger';
import type { Candidate } from '~/products/types';

interface CachedProduct {
  id: string;
  canonicalName: string;
  category: string | null;
  /** L2-normalized embedding. With unit vectors, cosine similarity == dot product. */
  embedding: Float32Array;
}

interface SearchOptions {
  topK: number;
}

/**
 * In-memory cosine-similarity search over the product catalog.
 *
 * Trade-offs:
 *  - All embeddings live in RAM. ~6KB per 1536-dim vector × N products. Fine up to ~100k products.
 *  - `loadAll()` is called once at startup; `addProduct()` keeps the cache in sync with new products.
 *  - We L2-normalize every vector at cache time, so cosine similarity becomes a single dot product
 *    — robust to embedding sources that don't normalize, no per-query norm recomputation.
 *
 * If the catalog grows past this design's sweet spot, swap this service for a vector DB
 * (pgvector / Qdrant) — the public interface stays the same.
 */
export default class CandidateSearchService {
  private cache: CachedProduct[] = [];

  constructor(
    private readonly productService: ProductService,
    private readonly logger: Logger,
  ) {}

  async loadAll(): Promise<void> {
    const start = Date.now();
    const products = await this.productService.findAll();

    this.cache = products.map(toCached);

    this.logger.info('Candidate cache loaded', {
      count: this.cache.length,
      durationMs: Date.now() - start,
    });
  }

  addProduct(product: Product): void {
    this.cache.push(toCached(product));
  }

  size(): number {
    return this.cache.length;
  }

  /**
   * Find the top-K products in the catalog most similar to `query`.
   *
   * Intentionally scans the FULL cache — no category filter. We tried filtering
   * by deal.category at one point but the AI extraction isn't deterministic on
   * categories: the same product, in two different deals, often receives two
   * different category labels. Filtering by category would then hide the
   * existing product from the second deal's candidate search and the resolver
   * would create a duplicate. The AUTO_MATCH threshold (0.95) is conservative
   * enough on its own to keep cross-category false positives out of the result.
   */
  findSimilar(query: number[], options: SearchOptions): Candidate[] {
    if (this.cache.length === 0) return [];

    const queryVec = normalize(Float32Array.from(query));
    if (!queryVec) return [];

    const scored = this.cache.map(p => ({
      productId: p.id,
      canonicalName: p.canonicalName,
      score: dot(queryVec, p.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, options.topK);
  }

}

function toCached(product: Product): CachedProduct {
  const raw = Float32Array.from(product.embedding);
  const normalized = normalize(raw) ?? raw;
  return {
    id: product.id,
    canonicalName: product.canonicalName,
    category: product.category,
    embedding: normalized,
  };
}

function normalize(v: Float32Array): Float32Array | null {
  let sum = 0;
  for (const x of v) sum += x * x;
  const n = Math.sqrt(sum);
  if (n === 0) return null;

  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = (v[i] as number) / n;
  return out;
}

function dot(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] as number) * (b[i] as number);
  return sum;
}
