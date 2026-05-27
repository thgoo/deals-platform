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
  category?: string;
}

export interface DuplicatePair {
  productA: { id: string; canonicalName: string };
  productB: { id: string; canonicalName: string };
  similarity: number;
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

  findSimilar(query: number[], options: SearchOptions): Candidate[] {
    if (this.cache.length === 0) return [];

    const queryVec = normalize(Float32Array.from(query));
    if (!queryVec) return [];

    const filtered = options.category
      ? this.cache.filter(p => p.category === options.category)
      : this.cache;

    const scored = filtered.map(p => ({
      productId: p.id,
      canonicalName: p.canonicalName,
      score: dot(queryVec, p.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, options.topK);
  }

  /**
   * Pairs of distinct products whose embeddings cosine-similarity-match above
   * `threshold` — likely duplicates that should have been merged. O(N²) pairwise
   * scan; acceptable for admin tooling at N up to a few thousand.
   */
  findDuplicatePairs(options: { threshold: number; limit: number }): DuplicatePair[] {
    const cache = this.cache;
    const pairs: DuplicatePair[] = [];

    for (let i = 0; i < cache.length; i++) {
      const a = cache[i];
      if (!a) continue;
      for (let j = i + 1; j < cache.length; j++) {
        const b = cache[j];
        if (!b) continue;
        const sim = dot(a.embedding, b.embedding);
        if (sim >= options.threshold) {
          pairs.push({
            productA: { id: a.id, canonicalName: a.canonicalName },
            productB: { id: b.id, canonicalName: b.canonicalName },
            similarity: sim,
          });
        }
      }
    }

    pairs.sort((a, b) => b.similarity - a.similarity);
    return pairs.slice(0, options.limit);
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
