import type { z } from 'zod';
import type { EmbedResponse } from './embed/schemas';
import type { ExtractResponse } from './extract/schemas';
import type { JudgeCandidate, JudgeResponse } from './judge/schemas';
import type { EmbeddingProvider } from './providers/embedding/types';
import type { LLMProvider } from './providers/llm/types';
import { config } from '~/config';
import { type Logger, logger as defaultLogger } from '~/logger';
import EmbedOrchestrator from './embed/embed-orchestrator';
import { embedRequestSchema } from './embed/schemas';
import ExtractOrchestrator from './extract/extract-orchestrator';
import { extractRequestSchema } from './extract/schemas';
import JudgeOrchestrator from './judge/judge-orchestrator';
import { judgeRequestSchema } from './judge/schemas';
import { createEmbeddingProvider } from './providers/embedding/factory';
import { createLLMProvider } from './providers/llm/factory';

export type ExtractInput = z.input<typeof extractRequestSchema>;
export type { EmbedResponse, ExtractResponse, JudgeCandidate, JudgeResponse };

/** Deal extraction, text embeddings and the product-match judge. */
export interface AiService {
  extract(input: ExtractInput): Promise<ExtractResponse>;
  embed(texts: string[]): Promise<EmbedResponse>;
  judge(newProduct: string, candidates: JudgeCandidate[]): Promise<JudgeResponse>;
}

/**
 * Runs the AI capabilities in-process (formerly the separate ai-service).
 *
 * Providers are created on first use, so constructing this never throws and
 * processes that never call the AI don't need API keys. Requests are validated
 * with the same schemas the ai-service's HTTP routes used, so invalid input
 * still fails the call instead of reaching the provider.
 */
export class InProcessAiService implements AiService {
  private llm?: LLMProvider;
  private embedding?: EmbeddingProvider;
  private extractor?: ExtractOrchestrator;
  private embedder?: EmbedOrchestrator;
  private judgeOrchestrator?: JudgeOrchestrator;

  constructor(private readonly logger: Logger = defaultLogger) {}

  async extract(input: ExtractInput): Promise<ExtractResponse> {
    const request = extractRequestSchema.parse(input);
    this.extractor ??= new ExtractOrchestrator(this.getLlm(), this.logger);
    return this.extractor.extract(request);
  }

  async embed(texts: string[]): Promise<EmbedResponse> {
    const request = embedRequestSchema.parse({ texts });
    this.embedder ??= new EmbedOrchestrator(this.getEmbedding(), this.logger);
    return this.embedder.embed(request);
  }

  async judge(newProduct: string, candidates: JudgeCandidate[]): Promise<JudgeResponse> {
    const request = judgeRequestSchema.parse({ newProduct, candidates });
    this.judgeOrchestrator ??= new JudgeOrchestrator(this.getLlm(), this.logger);
    return this.judgeOrchestrator.judge(request);
  }

  private getLlm(): LLMProvider {
    if (!this.llm) {
      this.llm = createLLMProvider(config.LLM_PROVIDER);
      this.logger.info('LLM provider initialized', { provider: this.llm.name, model: this.llm.model });
    }
    return this.llm;
  }

  private getEmbedding(): EmbeddingProvider {
    if (!this.embedding) {
      this.embedding = createEmbeddingProvider();
      this.logger.info('Embedding provider initialized', {
        provider: this.embedding.name,
        model: this.embedding.model,
      });
    }
    return this.embedding;
  }
}
