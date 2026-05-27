import type { MatchMethod } from '~/db/schemas/product-match-decisions';
import type { ExternalId } from '~/link-pipeline/types';

export interface ResolveInput {
  dealId: number;
  product: string | null;
  category: string | null;
  externalIds: ExternalId[];
}

export interface ResolveResult {
  productId: string | null;
  method: MatchMethod;
  similarityScore?: number;
}

export interface Candidate {
  productId: string;
  canonicalName: string;
  score: number;
}
