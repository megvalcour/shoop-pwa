/**
 * Pure scoring for reranking USDA FDC search candidates against an ingredient
 * phrase (Eat tab, Phase 4 — ADR-0027 Spike 1, mirrors `services/classifier.ts`).
 * Holds NO model/WASM dependency so the confidence floor + top-pick logic is
 * unit-testable in isolation; the embedding itself lives in the rerank worker
 * (`fdcMatcher.ts`), which delegates every decision here.
 *
 * Reranking is an internal refinement: when it is confident it improves the
 * auto-pick, but the manual-pick fallback guarantees correctness regardless, so a
 * below-floor (or model-unavailable) result still auto-selects the FDC top hit and
 * flags the row for review rather than blocking enrichment.
 */

/**
 * Cosine-similarity floor for treating a reranked top pick as confident. The
 * MiniLM embeddings are unit-normalized, so this is on the dot-product scale. A
 * pick below the floor is still used (as a best guess) but flagged `needsReview`.
 */
export const RERANK_CONFIDENCE_FLOOR = 0.45;

/** Cosine similarity of two equal-length vectors. Defensive against zero norms. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** An FDC candidate carried through the rerank, plus its similarity score. */
export interface ScoredCandidate {
  fdcId: string;
  description: string;
  score: number;
}

/**
 * Rank candidates by cosine similarity of their description embedding to the
 * query embedding, highest first. Pure — the caller supplies the embeddings.
 */
export function rankBySimilarity(
  queryEmbedding: number[],
  candidates: Array<{ fdcId: string; description: string; embedding: number[] }>,
): ScoredCandidate[] {
  return candidates
    .map((candidate) => ({
      fdcId: candidate.fdcId,
      description: candidate.description,
      score: cosineSimilarity(queryEmbedding, candidate.embedding),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Pick the best reranked candidate. Returns the top-scoring one with `confident`
 * set when its score clears {@link RERANK_CONFIDENCE_FLOOR}. Returns `null` only
 * for an empty list (the caller then falls back to the FDC top hit).
 */
export function selectBestCandidate(
  scored: ScoredCandidate[],
  floor: number = RERANK_CONFIDENCE_FLOOR,
): { candidate: ScoredCandidate; confident: boolean } | null {
  if (scored.length === 0) return null;
  const best = scored[0];
  return { candidate: best, confident: best.score >= floor };
}
