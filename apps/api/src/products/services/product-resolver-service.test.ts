import { beforeEach, describe, expect, test } from 'bun:test';
import type CandidateSearchService from './candidate-search-service';
import type DecisionService from './decision-service';
import type { RecordDecisionInput } from './decision-service';
import type { CreateProductInput } from './product-service';
import type ProductService from './product-service';
import type UrlMappingService from './url-mapping-service';
import type { EmbedResponse, JudgeCandidate, JudgeResponse } from '~/ai-service-client';
import type AiServiceClient from '~/ai-service-client';
import type { ProductUrlMapping, UrlMappingConfidence } from '~/db/schemas/product-url-mappings';
import type { Product } from '~/db/schemas/products';
import type { Candidate, ResolveInput } from '~/products/types';
import { EMBEDDING_MODEL_VERSIONS } from '~/db/schemas/products';
import ProductResolverService from './product-resolver-service';

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

const QUERY_EMBEDDING = [0.1, 0.2, 0.3];

class StubProductService {
  created: CreateProductInput[] = [];
  nextId = 'created-uuid';
  async create(input: CreateProductInput): Promise<Product> {
    this.created.push(input);
    return {
      id: this.nextId,
      canonicalName: input.canonicalName,
      modelKey: input.modelKey,
      category: input.category,
      embedding: input.embedding,
      embeddingModelVersion: input.embeddingModelVersion,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

interface SavedMapping {
  ids: { source: string; externalId: string }[];
  productId: string;
  confidence: UrlMappingConfidence;
}

class StubUrlMappingService {
  mappings: Record<string, ProductUrlMapping> = {};
  saved: SavedMapping[] = [];
  async findByExternalId(source: string, externalId: string): Promise<ProductUrlMapping | null> {
    return this.mappings[`${source}:${externalId}`] ?? null;
  }
  async saveAll(
    externalIds: { source: string; externalId: string }[],
    productId: string,
    confidence: UrlMappingConfidence,
  ): Promise<void> {
    this.saved.push({ ids: externalIds, productId, confidence });
  }
}

class StubDecisionService {
  recorded: RecordDecisionInput[] = [];
  async record(input: RecordDecisionInput): Promise<void> {
    this.recorded.push(input);
  }
}

class StubCandidateSearch {
  results: Candidate[] = [];
  added: Product[] = [];
  findSimilar(): Candidate[] {
    return this.results;
  }
  addProduct(product: Product): void {
    this.added.push(product);
  }
}

class StubAiClient {
  embedResponse: number[][] = [QUERY_EMBEDDING];
  embedError: Error | null = null;
  judgeResponse: JudgeResponse = { matchedId: null };
  judgeError: Error | null = null;
  judgeCalls: { newProduct: string; candidates: JudgeCandidate[] }[] = [];

  async embed(): Promise<EmbedResponse> {
    if (this.embedError) throw this.embedError;
    return {
      embeddings: this.embedResponse,
      model: 'test',
      dimensions: this.embedResponse[0]?.length ?? 0,
      usage: { promptTokens: 0, totalTokens: 0 },
    };
  }

  async judge(newProduct: string, candidates: JudgeCandidate[]): Promise<JudgeResponse> {
    this.judgeCalls.push({ newProduct, candidates });
    if (this.judgeError) throw this.judgeError;
    return this.judgeResponse;
  }
}

function makeInput(overrides: Partial<ResolveInput> = {}): ResolveInput {
  return {
    dealId: 42,
    product: 'PlayStation 5 Slim Digital 1TB',
    category: 'games',
    externalIds: [],
    ...overrides,
  };
}

describe('ProductResolverService', () => {
  let products: StubProductService;
  let urlMappings: StubUrlMappingService;
  let decisions: StubDecisionService;
  let candidateSearch: StubCandidateSearch;
  let ai: StubAiClient;
  let resolver: ProductResolverService;

  beforeEach(() => {
    products = new StubProductService();
    urlMappings = new StubUrlMappingService();
    decisions = new StubDecisionService();
    candidateSearch = new StubCandidateSearch();
    ai = new StubAiClient();
    resolver = new ProductResolverService(
      products as unknown as ProductService,
      urlMappings as unknown as UrlMappingService,
      decisions as unknown as DecisionService,
      candidateSearch as unknown as CandidateSearchService,
      ai as unknown as AiServiceClient,
      silentLogger,
    );
  });

  describe('url_anchor path', () => {
    test('returns existing product when external id is already mapped', async () => {
      urlMappings.mappings['amazon:B0CL5KNB9M'] = {
        id: 1, source: 'amazon', externalId: 'B0CL5KNB9M',
        productId: 'existing-product', confidence: 'llm_high', createdAt: new Date(),
      };

      const result = await resolver.resolve(makeInput({
        externalIds: [{ source: 'amazon', externalId: 'B0CL5KNB9M' }],
      }));

      expect(result).toEqual({ productId: 'existing-product', method: 'url_anchor' });
      expect(decisions.recorded[0]?.method).toBe('url_anchor');
      expect(ai.judgeCalls).toHaveLength(0);
    });

    test('tries each external id until one matches', async () => {
      urlMappings.mappings['kabum:99999'] = {
        id: 2, source: 'kabum', externalId: '99999',
        productId: 'kabum-product', confidence: 'llm_high', createdAt: new Date(),
      };

      const result = await resolver.resolve(makeInput({
        externalIds: [
          { source: 'amazon', externalId: 'NOT_MAPPED' },
          { source: 'kabum', externalId: '99999' },
        ],
      }));

      expect(result.productId).toBe('kabum-product');
    });
  });

  describe('skipped path', () => {
    test('returns null when no product was extracted', async () => {
      const result = await resolver.resolve(makeInput({ product: null }));
      expect(result).toEqual({ productId: null, method: 'skipped' });
      expect(decisions.recorded[0]?.method).toBe('skipped');
    });

    test('returns null when embedding service fails', async () => {
      ai.embedError = new Error('ai-service down');
      const result = await resolver.resolve(makeInput());
      expect(result.method).toBe('skipped');
    });
  });

  describe('embedding_only path (>= 0.95)', () => {
    test('reuses top candidate when score is above the auto-match threshold', async () => {
      candidateSearch.results = [{ productId: 'existing', canonicalName: 'X', score: 0.97 }];

      const result = await resolver.resolve(makeInput());

      expect(result).toEqual({
        productId: 'existing',
        method: 'embedding_only',
        similarityScore: 0.97,
      });
      expect(ai.judgeCalls).toHaveLength(0);
    });

    test('saves URL mapping with llm_high confidence', async () => {
      candidateSearch.results = [{ productId: 'existing', canonicalName: 'X', score: 0.97 }];

      await resolver.resolve(makeInput({
        externalIds: [{ source: 'amazon', externalId: 'B0X' }],
      }));

      expect(urlMappings.saved[0]).toMatchObject({
        productId: 'existing',
        confidence: 'llm_high',
      });
    });
  });

  describe('llm_judge path (0.75–0.95)', () => {
    test('asks the judge when similarity is ambiguous', async () => {
      candidateSearch.results = [{ productId: 'maybe', canonicalName: 'maybe', score: 0.85 }];
      ai.judgeResponse = { matchedId: 'maybe' };

      const result = await resolver.resolve(makeInput());

      expect(result.method).toBe('llm_judge');
      expect(result.productId).toBe('maybe');
      expect(ai.judgeCalls).toHaveLength(1);
    });

    test('saves URL mapping with llm_medium confidence after a judge match', async () => {
      candidateSearch.results = [{ productId: 'maybe', canonicalName: 'maybe', score: 0.85 }];
      ai.judgeResponse = { matchedId: 'maybe' };

      await resolver.resolve(makeInput({
        externalIds: [{ source: 'amazon', externalId: 'B0X' }],
      }));

      expect(urlMappings.saved[0]?.confidence).toBe('llm_medium');
    });

    test('creates a new product when the judge returns null', async () => {
      candidateSearch.results = [{ productId: 'maybe', canonicalName: 'maybe', score: 0.85 }];
      ai.judgeResponse = { matchedId: null };

      const result = await resolver.resolve(makeInput());

      expect(result.method).toBe('created_new');
      expect(products.created).toHaveLength(1);
    });

    test('falls back to creating a new product when the judge throws', async () => {
      candidateSearch.results = [{ productId: 'maybe', canonicalName: 'maybe', score: 0.85 }];
      ai.judgeError = new Error('judge down');

      const result = await resolver.resolve(makeInput());

      expect(result.method).toBe('created_new');
      expect(products.created).toHaveLength(1);
    });
  });

  describe('created_new path (< 0.75)', () => {
    test('creates a new product when no candidates pass the threshold', async () => {
      candidateSearch.results = [{ productId: 'far', canonicalName: 'far', score: 0.50 }];

      const result = await resolver.resolve(makeInput());

      expect(result.method).toBe('created_new');
      expect(products.created).toHaveLength(1);
      expect(products.created[0]).toMatchObject({
        canonicalName: 'PlayStation 5 Slim Digital 1TB',
        category: 'games',
        embeddingModelVersion: EMBEDDING_MODEL_VERSIONS.OPENAI_TEXT_EMBEDDING_3_SMALL,
      });
    });

    test('creates a new product when there are zero candidates', async () => {
      candidateSearch.results = [];
      const result = await resolver.resolve(makeInput());
      expect(result.method).toBe('created_new');
    });

    test('adds the newly created product to the candidate search cache', async () => {
      candidateSearch.results = [];
      await resolver.resolve(makeInput());
      expect(candidateSearch.added).toHaveLength(1);
      expect(candidateSearch.added[0]?.canonicalName).toBe('PlayStation 5 Slim Digital 1TB');
    });
  });

  describe('audit', () => {
    test('records candidates snapshot for non-trivial decisions', async () => {
      candidateSearch.results = [
        { productId: 'a', canonicalName: 'A', score: 0.97 },
        { productId: 'b', canonicalName: 'B', score: 0.80 },
      ];
      await resolver.resolve(makeInput());
      expect(decisions.recorded[0]?.candidates).toHaveLength(2);
      expect(decisions.recorded[0]?.similarityScore).toBe(0.97);
    });

    test('does not include candidates for skipped decisions', async () => {
      await resolver.resolve(makeInput({ product: null }));
      expect(decisions.recorded[0]?.candidates).toBeUndefined();
    });
  });
});
