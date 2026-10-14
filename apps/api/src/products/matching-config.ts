/**
 * Thresholds and tuning knobs for product resolver / catalog matching.
 *
 * Shared between the live resolver (POST /api/deals) and the backfill script so
 * both paths use the same matching policy and never drift out of sync.
 *
 * Tuning notes:
 *
 *   AUTO_MATCH_THRESHOLD (0.95) — above this similarity we accept the top
 *   candidate as a definite match without involving the LLM. Conservative on
 *   purpose: same-product embeddings reliably hit ≥ 0.95 in practice.
 *
 *   LLM_JUDGE_THRESHOLD (0.80) — below this we assume no plausible match and
 *   create a new product. Between this and AUTO_MATCH_THRESHOLD, the LLM judge
 *   breaks the tie. Originally 0.75; raised to 0.80 after observing that
 *   scores in [0.75, 0.80) on a real dataset were dominated by false-positive
 *   matches (different chips, different game titles), so we'd rather skip the
 *   LLM and create a new product than risk corrupting price history.
 *
 *   CANDIDATE_TOP_K (5) — how many similar candidates to surface to the LLM
 *   judge. Five is enough context without making the prompt heavy.
 */

export const AUTO_MATCH_THRESHOLD = 0.95;
export const LLM_JUDGE_THRESHOLD = 0.80;
export const CANDIDATE_TOP_K = 5;
