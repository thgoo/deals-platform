/**
 * Backfill: walk every deal that has an extracted product but no `product_id`
 * and run it through the catalog resolver. Creates products, URL mappings, and
 * audit decisions for all historical deals in a single pass.
 *
 * Usage:
 *   bun run scripts/backfill-product-catalog.ts              # full run
 *   bun run scripts/backfill-product-catalog.ts --limit 100  # smoke test
 *
 * Operational notes:
 *   - STOP the crawler before running. Live ingestion would race against the
 *     in-memory candidate cache and may create duplicate products.
 *   - Idempotent: safe to re-run. Filters out deals already resolved.
 *   - Crash-resilient: a re-run picks up unfinished deals naturally.
 */
import 'dotenv/config';
import { and, asc, count, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Deal } from '~/db/schemas/deals';
import type { MatchMethod } from '~/db/schemas/product-match-decisions';
import type { ExternalId } from '~/link-pipeline/types';
import type { Candidate } from '~/products/types';
import AiServiceClient from '~/ai-service-client';
import db from '~/db';
import { dealsTable } from '~/db/schemas/deals';
import { EMBEDDING_MODEL_VERSIONS } from '~/db/schemas/products';
import { extractExternalIds } from '~/link-pipeline/identifiers/identifier-extractor';
import { buildIdentifierRegistry } from '~/link-pipeline/identifiers/registry';
import { logger } from '~/logger';
import { AUTO_MATCH_THRESHOLD, CANDIDATE_TOP_K, LLM_JUDGE_THRESHOLD } from '~/products/matching-config';
import CandidateSearchService from '~/products/services/candidate-search-service';
import DecisionService from '~/products/services/decision-service';
import ProductService from '~/products/services/product-service';
import UrlMappingService from '~/products/services/url-mapping-service';

const BATCH_SIZE = 100;
const CANONICAL_NAME_MAX = 500;
const PROGRESS_EVERY = 50;
const ETA_WINDOW_SIZE = 5;

interface Stats {
  url_anchor: number;
  embedding_only: number;
  llm_judge: number;
  created_new: number;
  batch_errors: number;
}

interface BatchTime {
  durationMs: number;
  dealCount: number;
}

interface CliArgs {
  limit?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') {
      const next = argv[i + 1];
      if (next) {
        const n = parseInt(next, 10);
        if (Number.isFinite(n) && n > 0) result.limit = n;
        i++;
      }
    }
  }
  return result;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

function parseLinks(raw: Deal['links']): string[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

class Backfill {
  private readonly stats: Stats = {
    url_anchor: 0,
    embedding_only: 0,
    llm_judge: 0,
    created_new: 0,
    batch_errors: 0,
  };

  private readonly batchTimes: BatchTime[] = [];
  private readonly identifierRegistry = buildIdentifierRegistry();

  constructor(
    private readonly products: ProductService,
    private readonly urlMappings: UrlMappingService,
    private readonly decisions: DecisionService,
    private readonly candidateSearch: CandidateSearchService,
    private readonly ai: AiServiceClient,
  ) {}

  async run(limit?: number): Promise<void> {
    await this.candidateSearch.loadAll();

    const totalToProcess = await this.countUnresolved(limit);
    logger.info('Backfill starting', {
      totalToProcess,
      batchSize: BATCH_SIZE,
      cachedProducts: this.candidateSearch.size(),
    });

    const overallStart = Date.now();
    let processed = 0;

    while (true) {
      const remaining = limit !== undefined ? Math.max(0, limit - processed) : undefined;
      if (remaining === 0) break;

      const fetchSize = remaining !== undefined ? Math.min(BATCH_SIZE, remaining) : BATCH_SIZE;
      const batch = await this.fetchBatch(fetchSize);
      if (batch.length === 0) break;

      const batchStart = Date.now();
      try {
        await this.processBatch(batch);
      } catch (error) {
        this.stats.batch_errors += batch.length;
        logger.error('Batch failed; skipping (deals will be retried on next run)', {
          batchSize: batch.length,
          firstDealId: batch[0]?.id,
          lastDealId: batch[batch.length - 1]?.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      this.recordBatchTime(Date.now() - batchStart, batch.length);

      processed += batch.length;

      if (processed % PROGRESS_EVERY === 0 || batch.length < BATCH_SIZE) {
        this.logProgress(processed, totalToProcess);
      }
    }

    this.logFinal(processed, Date.now() - overallStart);
  }

  private async countUnresolved(limit?: number): Promise<number> {
    const [row] = await db.select({ count: count() })
      .from(dealsTable)
      .where(and(isNotNull(dealsTable.product), isNull(dealsTable.productId)));
    const total = Number(row?.count ?? 0);
    return limit !== undefined ? Math.min(total, limit) : total;
  }

  private async fetchBatch(size: number): Promise<Deal[]> {
    return db.select()
      .from(dealsTable)
      .where(and(isNotNull(dealsTable.product), isNull(dealsTable.productId)))
      .orderBy(asc(dealsTable.id))
      .limit(size);
  }

  private async processBatch(deals: Deal[]): Promise<void> {
    // Phase 1: URL anchor (cheap, sequential per deal).
    const remaining: Deal[] = [];
    for (const deal of deals) {
      const externalIds = extractExternalIds(parseLinks(deal.links), this.identifierRegistry);
      const anchored = await this.tryUrlAnchor(deal, externalIds);
      if (!anchored) remaining.push(deal);
    }

    if (remaining.length === 0) return;

    // Phase 2: Batch-embed everything that survived the URL anchor pass.
    const productNames = remaining.map(d => d.product ?? '');
    const embedResult = await this.ai.embed(productNames);

    // Phase 3: Decide for each.
    for (let i = 0; i < remaining.length; i++) {
      const deal = remaining[i];
      const embedding = embedResult.embeddings[i];
      if (!deal || !embedding) continue;

      const externalIds = extractExternalIds(parseLinks(deal.links), this.identifierRegistry);
      const candidates = this.candidateSearch.findSimilar(embedding, {
        topK: CANDIDATE_TOP_K,
      });
      await this.decide(deal, embedding, externalIds, candidates);
    }
  }

  private async tryUrlAnchor(deal: Deal, externalIds: ExternalId[]): Promise<boolean> {
    for (const ext of externalIds) {
      const existing = await this.urlMappings.findByExternalId(ext.source, ext.externalId);
      if (existing) {
        await this.applyResolution(deal, existing.productId, 'url_anchor');
        this.stats.url_anchor++;
        return true;
      }
    }
    return false;
  }

  private async decide(
    deal: Deal,
    embedding: number[],
    externalIds: ExternalId[],
    candidates: Candidate[],
  ): Promise<void> {
    const best = candidates[0];

    if (!best || best.score < LLM_JUDGE_THRESHOLD) {
      await this.createAndPersist(deal, embedding, externalIds, candidates, best?.score, 'llm_high');
      this.stats.created_new++;
      return;
    }

    if (best.score >= AUTO_MATCH_THRESHOLD) {
      await this.urlMappings.saveAll(externalIds, best.productId, 'llm_high');
      await this.applyResolution(deal, best.productId, 'embedding_only', candidates, best.score);
      this.stats.embedding_only++;
      return;
    }

    // Ambiguous zone — ask the LLM judge.
    let matchedId: string | null = null;
    try {
      const judgeResult = await this.ai.judge(
        deal.product ?? '',
        candidates.map(c => ({ id: c.productId, name: c.canonicalName, score: c.score })),
      );
      matchedId = judgeResult.matchedId;
    } catch (error) {
      logger.warn('LLM judge failed; falling back to create new product', {
        dealId: deal.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (matchedId) {
      await this.urlMappings.saveAll(externalIds, matchedId, 'llm_medium');
      await this.applyResolution(deal, matchedId, 'llm_judge', candidates, best.score);
      this.stats.llm_judge++;
    } else {
      await this.createAndPersist(deal, embedding, externalIds, candidates, best.score, 'llm_medium');
      this.stats.created_new++;
    }
  }

  private async createAndPersist(
    deal: Deal,
    embedding: number[],
    externalIds: ExternalId[],
    candidates: Candidate[],
    topScore: number | undefined,
    mappingConfidence: 'llm_high' | 'llm_medium',
  ): Promise<void> {
    const product = await this.products.create({
      canonicalName: truncate(deal.product ?? '', CANONICAL_NAME_MAX),
      modelKey: null,
      category: deal.category,
      embedding,
      embeddingModelVersion: EMBEDDING_MODEL_VERSIONS.OPENAI_TEXT_EMBEDDING_3_SMALL,
    });

    this.candidateSearch.addProduct(product);
    await this.urlMappings.saveAll(externalIds, product.id, mappingConfidence);
    await this.applyResolution(deal, product.id, 'created_new', candidates, topScore);
  }

  private async applyResolution(
    deal: Deal,
    productId: string,
    method: MatchMethod,
    candidates?: Candidate[],
    similarityScore?: number,
  ): Promise<void> {
    await db.update(dealsTable)
      .set({ productId })
      .where(eq(dealsTable.id, deal.id));

    await this.decisions.record({
      dealId: deal.id,
      productId,
      method,
      candidates: candidates && candidates.length > 0 ? candidates : undefined,
      similarityScore,
    });
  }

  private recordBatchTime(durationMs: number, dealCount: number): void {
    this.batchTimes.push({ durationMs, dealCount });
    if (this.batchTimes.length > ETA_WINDOW_SIZE) this.batchTimes.shift();
  }

  private estimateEta(remaining: number): string {
    if (this.batchTimes.length === 0 || remaining <= 0) return '—';
    const totalMs = this.batchTimes.reduce((a, b) => a + b.durationMs, 0);
    const totalDeals = this.batchTimes.reduce((a, b) => a + b.dealCount, 0);
    if (totalDeals === 0) return '—';
    return formatDuration(remaining * (totalMs / totalDeals));
  }

  private logProgress(processed: number, total: number): void {
    const pct = total > 0 ? ((processed / total) * 100).toFixed(1) : '?';
    logger.info('Backfill progress', {
      processed,
      total,
      pct: `${pct}%`,
      eta: this.estimateEta(Math.max(0, total - processed)),
      ...this.stats,
    });
  }

  private logFinal(processed: number, durationMs: number): void {
    logger.info('Backfill complete', {
      processed,
      totalDuration: formatDuration(durationMs),
      ...this.stats,
    });
  }
}

async function main(): Promise<void> {
  const { limit } = parseArgs(process.argv.slice(2));

  const productService = new ProductService();
  const urlMappingService = new UrlMappingService();
  const decisionService = new DecisionService();
  const candidateSearch = new CandidateSearchService(productService, logger);
  const aiClient = new AiServiceClient();

  const backfill = new Backfill(
    productService,
    urlMappingService,
    decisionService,
    candidateSearch,
    aiClient,
  );

  await backfill.run(limit);
}

// Explicit exit on success — the mysql2 pool keeps TCP sockets warm, which
// holds the Bun event loop alive even after work is done. For a one-shot CLI
// script there's nothing to gracefully shut down, so force-exit is the right
// call: in-flight writes are already awaited before main() returns.
main()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Backfill aborted with unhandled error', {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    process.exit(1);
  });
