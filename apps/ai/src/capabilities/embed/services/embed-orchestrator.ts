import type { EmbedRequest, EmbedResponse } from '../schemas';
import type { Logger } from '~/logger';
import type { EmbeddingProvider } from '~/providers/embedding/types';

export default class EmbedOrchestrator {
  constructor(
    private readonly provider: EmbeddingProvider,
    private readonly logger: Logger,
  ) {}

  async embed(input: EmbedRequest): Promise<EmbedResponse> {
    const start = Date.now();

    this.logger.info('Embedding started', {
      count: input.texts.length,
      provider: this.provider.name,
    });

    const result = await this.provider.embed(input.texts);

    this.logger.info('Embedding completed', {
      provider: this.provider.name,
      count: result.embeddings.length,
      dimensions: result.dimensions,
      durationMs: Date.now() - start,
      tokens: result.usage.totalTokens,
    });

    return result;
  }
}
