export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  embed(texts: string[]): Promise<EmbeddingResult>;
}
