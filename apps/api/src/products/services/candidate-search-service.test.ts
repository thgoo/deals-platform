import { beforeEach, describe, expect, test } from 'bun:test';
import type ProductService from './product-service';
import type { Product } from '~/db/schemas/products';
import CandidateSearchService from './candidate-search-service';

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

class StubProductService {
  rows: Product[] = [];
  async findAll(): Promise<Product[]> {
    return this.rows;
  }
}

function makeProduct(id: string, name: string, embedding: number[], category: string | null = null): Product {
  return {
    id,
    canonicalName: name,
    modelKey: null,
    category,
    embedding,
    embeddingModelVersion: 'openai/text-embedding-3-small',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('CandidateSearchService', () => {
  let stub: StubProductService;
  let service: CandidateSearchService;

  beforeEach(() => {
    stub = new StubProductService();
    service = new CandidateSearchService(stub as unknown as ProductService, silentLogger);
  });

  test('returns empty array when cache is empty', () => {
    expect(service.findSimilar([1, 0, 0], { topK: 5 })).toEqual([]);
  });

  test('loadAll populates the cache from the product service', async () => {
    stub.rows = [
      makeProduct('a', 'A', [1, 0, 0]),
      makeProduct('b', 'B', [0, 1, 0]),
    ];
    await service.loadAll();
    expect(service.size()).toBe(2);
  });

  test('addProduct grows the cache by one', async () => {
    await service.loadAll();
    service.addProduct(makeProduct('a', 'A', [1, 0, 0]));
    expect(service.size()).toBe(1);
  });

  test('identical vectors yield score ~1.0', async () => {
    stub.rows = [makeProduct('a', 'A', [1, 2, 3])];
    await service.loadAll();
    const result = service.findSimilar([1, 2, 3], { topK: 1 });
    expect(result[0]?.score).toBeCloseTo(1.0, 5);
  });

  test('orthogonal vectors yield score ~0', async () => {
    stub.rows = [makeProduct('a', 'A', [1, 0, 0])];
    await service.loadAll();
    const result = service.findSimilar([0, 1, 0], { topK: 1 });
    expect(result[0]?.score).toBeCloseTo(0, 5);
  });

  test('opposite vectors yield score ~-1', async () => {
    stub.rows = [makeProduct('a', 'A', [1, 0, 0])];
    await service.loadAll();
    const result = service.findSimilar([-1, 0, 0], { topK: 1 });
    expect(result[0]?.score).toBeCloseTo(-1, 5);
  });

  test('zero-vector query yields no results', async () => {
    stub.rows = [makeProduct('a', 'A', [1, 0, 0])];
    await service.loadAll();
    expect(service.findSimilar([0, 0, 0], { topK: 5 })).toEqual([]);
  });

  test('returns top-K candidates sorted by descending score', async () => {
    stub.rows = [
      makeProduct('far', 'far', [0.1, 0.99, 0]),
      makeProduct('near', 'near', [0.99, 0.1, 0]),
      makeProduct('medium', 'medium', [0.7, 0.7, 0]),
    ];
    await service.loadAll();
    const result = service.findSimilar([1, 0, 0], { topK: 3 });
    expect(result.map(r => r.productId)).toEqual(['near', 'medium', 'far']);
    const [first, second, third] = result;
    expect(first?.score).toBeGreaterThan(second?.score ?? 0);
    expect(second?.score).toBeGreaterThan(third?.score ?? 0);
  });

  test('respects topK limit', async () => {
    stub.rows = [
      makeProduct('a', 'A', [1, 0, 0]),
      makeProduct('b', 'B', [0, 1, 0]),
      makeProduct('c', 'C', [0, 0, 1]),
    ];
    await service.loadAll();
    const result = service.findSimilar([1, 1, 1], { topK: 2 });
    expect(result).toHaveLength(2);
  });

  test('returns all candidates when topK exceeds cache size', async () => {
    stub.rows = [
      makeProduct('a', 'A', [1, 0, 0]),
      makeProduct('b', 'B', [0, 1, 0]),
    ];
    await service.loadAll();
    const result = service.findSimilar([1, 0, 0], { topK: 100 });
    expect(result).toHaveLength(2);
  });

  test('filters by category', async () => {
    stub.rows = [
      makeProduct('a', 'A', [1, 0, 0], 'games'),
      makeProduct('b', 'B', [0.95, 0.05, 0], 'notebooks'),
      makeProduct('c', 'C', [0.9, 0.1, 0], 'games'),
    ];
    await service.loadAll();
    const result = service.findSimilar([1, 0, 0], { topK: 5, category: 'games' });
    expect(result.map(r => r.productId).sort()).toEqual(['a', 'c']);
  });

  test('returns empty when category filter matches nothing', async () => {
    stub.rows = [makeProduct('a', 'A', [1, 0, 0], 'games')];
    await service.loadAll();
    expect(service.findSimilar([1, 0, 0], { topK: 5, category: 'notebooks' })).toEqual([]);
  });

  test('normalizes vectors of different magnitudes — same direction yields score 1.0', async () => {
    stub.rows = [makeProduct('a', 'A', [2, 0, 0])];
    await service.loadAll();
    const result = service.findSimilar([10, 0, 0], { topK: 1 });
    expect(result[0]?.score).toBeCloseTo(1.0, 5);
  });
});
