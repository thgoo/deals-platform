import type CandidateSearchService from './candidate-search-service';
import type DecisionService from './decision-service';
import type ProductService from './product-service';
import type UrlMappingService from './url-mapping-service';
import type AiServiceClient from '~/ai-service-client';
import type { ExternalId } from '~/link-pipeline/types';
import type { Logger } from '~/logger';
import type { Candidate, ResolveInput, ResolveResult } from '~/products/types';
import { EMBEDDING_MODEL_VERSIONS } from '~/db/schemas/products';
import {
  AUTO_MATCH_THRESHOLD,
  CANDIDATE_TOP_K,
  LLM_JUDGE_THRESHOLD,
} from '~/products/matching-config';
import { specsConflict } from '~/products/utils/spec-conflict';

const SKIPPED_RESULT: ResolveResult = { productId: null, method: 'skipped' };

// Sources where two different external IDs = two physically different products.
// Mercado Livre is excluded: one product legitimately has many MLBs (one per seller).
// host-fallback is excluded: slug/path IDs are not stable enough for this guarantee.
const CATALOG_SOURCES = new Set([
  'amazon', 'terabyte', 'kabum', 'pichau', 'magalu', 'aliexpress', 'shopee',
]);

/**
 * Decides which product a deal belongs to (or creates a new one).
 *
 * Strategy, in order:
 *  1. URL anchor — if any external id (ASIN, MLB, ...) is already mapped, reuse that product. Cheap and 100% accurate.
 *  2. Skip — if the deal has no extracted product name, there is nothing to match.
 *  3. Embedding similarity — embed the product name, find top-K nearest candidates.
 *       - >= 0.95: auto-match, no LLM.
 *       - 0.75–0.95: ambiguous, ask the LLM judge.
 *       - < 0.75: create a new product.
 *
 * Every decision is recorded for audit and threshold calibration. URL mappings are saved on every
 * success path so that future deals with the same external id resolve via the cheap anchor path.
 */
export default class ProductResolverService {
  constructor(
    private readonly products: ProductService,
    private readonly urlMappings: UrlMappingService,
    private readonly decisions: DecisionService,
    private readonly candidateSearch: CandidateSearchService,
    private readonly ai: AiServiceClient,
    private readonly logger: Logger,
  ) {}

  async resolve(input: ResolveInput): Promise<ResolveResult> {
    const start = Date.now();

    const anchorMatch = await this.tryUrlAnchor(input);
    if (anchorMatch) {
      this.logResolved(input.dealId, anchorMatch, start);
      return anchorMatch;
    }

    const productName = input.product;
    if (!productName) {
      await this.decisions.record({ dealId: input.dealId, productId: null, method: 'skipped' });
      this.logResolved(input.dealId, SKIPPED_RESULT, start);
      return SKIPPED_RESULT;
    }

    const result = await this.resolveBySemantic(input, productName);
    this.logResolved(input.dealId, result, start);
    return result;
  }

  private async tryUrlAnchor(input: ResolveInput): Promise<ResolveResult | null> {
    for (const ext of input.externalIds) {
      const existing = await this.urlMappings.findByExternalId(ext.source, ext.externalId);
      if (existing) {
        await this.decisions.record({
          dealId: input.dealId,
          productId: existing.productId,
          method: 'url_anchor',
        });
        return { productId: existing.productId, method: 'url_anchor' };
      }
    }
    return null;
  }

  private async resolveBySemantic(input: ResolveInput, productName: string): Promise<ResolveResult> {
    const queryEmbedding = await this.embedOrFail(input, productName);
    if (!queryEmbedding) {
      await this.decisions.record({ dealId: input.dealId, productId: null, method: 'skipped' });
      return SKIPPED_RESULT;
    }

    const candidates = this.candidateSearch.findSimilar(queryEmbedding, {
      topK: CANDIDATE_TOP_K,
    });

    const best = candidates[0];

    if (!best || best.score < LLM_JUDGE_THRESHOLD) {
      return this.createNewProduct(input, productName, queryEmbedding, candidates, best?.score);
    }

    // Spec gate applies to ALL match paths. If specs disagree (BTU, GB, RTX
    // model, polegadas, etc.), the deal is for a different product no matter
    // how close the embedding looks — skip both auto-match and the judge.
    // Past data showed the LLM judge accepting matches with clear storage /
    // capacity differences ("HD 8TB" vs "HD 12TB", "256GB" vs "512GB"), so
    // putting specsConflict in front of the judge is safer than asking it.
    if (specsConflict(productName, best.canonicalName)) {
      return this.createNewProduct(input, productName, queryEmbedding, candidates, best.score);
    }

    if (best.score >= AUTO_MATCH_THRESHOLD) {
      if (await this.hasCatalogIdConflict(best.productId, input.externalIds)) {
        return this.createNewProduct(input, productName, queryEmbedding, candidates, best.score);
      }
      await this.urlMappings.saveAll(input.externalIds, best.productId, 'llm_high');
      await this.decisions.record({
        dealId: input.dealId,
        productId: best.productId,
        method: 'embedding_only',
        candidates,
        similarityScore: best.score,
      });
      return { productId: best.productId, method: 'embedding_only', similarityScore: best.score };
    }

    return this.askJudgeAndDecide(input, productName, queryEmbedding, candidates);
  }

  private async askJudgeAndDecide(
    input: ResolveInput,
    productName: string,
    queryEmbedding: number[],
    candidates: Candidate[],
  ): Promise<ResolveResult> {
    let matchedId: string | null = null;
    try {
      const judgeResult = await this.ai.judge(productName, candidates.map(c => ({
        id: c.productId,
        name: c.canonicalName,
        score: c.score,
      })));
      matchedId = judgeResult.matchedId;
    } catch (error) {
      this.logger.warn('LLM judge failed, falling back to create new product', {
        dealId: input.dealId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (matchedId) {
      if (await this.hasCatalogIdConflict(matchedId, input.externalIds)) {
        const topScore = candidates[0]?.score;
        return this.createNewProduct(input, productName, queryEmbedding, candidates, topScore, 'llm_medium');
      }
      await this.urlMappings.saveAll(input.externalIds, matchedId, 'llm_medium');
      await this.decisions.record({
        dealId: input.dealId,
        productId: matchedId,
        method: 'llm_judge',
        candidates,
        similarityScore: candidates[0]?.score,
      });
      return { productId: matchedId, method: 'llm_judge', similarityScore: candidates[0]?.score };
    }

    return this.createNewProduct(input, productName, queryEmbedding, candidates, candidates[0]?.score, 'llm_medium');
  }

  private async createNewProduct(
    input: ResolveInput,
    productName: string,
    embedding: number[],
    candidates: Candidate[],
    topScore: number | undefined,
    mappingConfidence: 'llm_high' | 'llm_medium' = 'llm_high',
  ): Promise<ResolveResult> {
    const product = await this.products.create({
      canonicalName: productName,
      modelKey: null,
      category: input.category,
      embedding,
      embeddingModelVersion: EMBEDDING_MODEL_VERSIONS.OPENAI_TEXT_EMBEDDING_3_SMALL,
    });

    this.candidateSearch.addProduct(product);
    await this.urlMappings.saveAll(input.externalIds, product.id, mappingConfidence);
    await this.decisions.record({
      dealId: input.dealId,
      productId: product.id,
      method: 'created_new',
      candidates: candidates.length > 0 ? candidates : undefined,
      similarityScore: topScore,
    });

    return { productId: product.id, method: 'created_new', similarityScore: topScore };
  }

  private async embedOrFail(input: ResolveInput, productName: string): Promise<number[] | null> {
    try {
      const response = await this.ai.embed([productName]);
      const embedding = response.embeddings[0];
      return embedding && embedding.length > 0 ? embedding : null;
    } catch (error) {
      this.logger.error('Failed to embed product name; skipping resolution', {
        dealId: input.dealId,
        product: productName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async hasCatalogIdConflict(candidateId: string, incomingIds: ExternalId[]): Promise<boolean> {
    const specific = incomingIds.filter(id => CATALOG_SOURCES.has(id.source));
    if (specific.length === 0) return false;

    for (const incoming of specific) {
      const existing = await this.urlMappings.findByProductAndSource(candidateId, incoming.source);
      const conflict = existing.find(m => m.externalId !== incoming.externalId);
      if (conflict) {
        this.logger.warn('Catalog ID conflict — rejecting semantic merge', {
          candidateId,
          source: incoming.source,
          incomingId: incoming.externalId,
          existingId: conflict.externalId,
        });
        return true;
      }
    }
    return false;
  }

  private logResolved(dealId: number, result: ResolveResult, start: number): void {
    this.logger.info('Deal resolved to product', {
      dealId,
      productId: result.productId,
      method: result.method,
      score: result.similarityScore,
      durationMs: Date.now() - start,
    });
  }
}
