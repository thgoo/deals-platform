import type { CandidateSnapshot, MatchMethod, NewProductMatchDecision } from '~/db/schemas/product-match-decisions';
import type { Candidate } from '~/products/types';
import db from '~/db';
import { productMatchDecisionsTable } from '~/db/schemas/product-match-decisions';

export interface RecordDecisionInput {
  dealId: number;
  productId: string | null;
  method: MatchMethod;
  candidates?: Candidate[];
  similarityScore?: number;
}

export default class DecisionService {
  async record(input: RecordDecisionInput): Promise<void> {
    const row: NewProductMatchDecision = {
      dealId: input.dealId,
      productId: input.productId,
      method: input.method,
      topCandidates: input.candidates?.map(toSnapshot),
      similarityScore: input.similarityScore !== undefined
        ? input.similarityScore.toFixed(4)
        : null,
    };

    await db.insert(productMatchDecisionsTable).values(row);
  }
}

function toSnapshot(candidate: Candidate): CandidateSnapshot {
  return {
    productId: candidate.productId,
    canonicalName: candidate.canonicalName,
    score: candidate.score,
  };
}
