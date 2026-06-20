// Pure, deterministic scoring logic for aisle classification.
//
// This module contains NO model / WASM dependency so it can be unit-tested in
// isolation (see ADR-0011). `useAisleMatcher.ts` owns model loading + embedding
// and delegates all scoring decisions here.

/** Cosine-similarity floor for accepting a semantic match. */
export const THRESHOLD = 0.5;

/** Number of top semantic neighbours aggregated when voting on an aisle. */
export const TOP_K = 5;

// Words that carry no department signal. Qualifiers like `fresh`, `canned`,
// `packaged` are deliberately NOT stopwords — they disambiguate Produce from
// canned goods, the cheese case from packaged cheese, etc.
const STOPWORDS = new Set(['and', 'the', 'with', 'in', 'of', 'a', 'an', 'for', 'to']);

/** A single matchable phrase pointing at the department it belongs to. */
export interface Candidate {
  /** Normalized natural phrase, used as embedding input (e.g. `fresh fruit`). */
  phrase: string;
  /** Normalized tokens of `phrase`, used by the lexical fast-path. */
  tokens: string[];
  /** The aisle `number` (department key) this candidate resolves to. */
  aisleNumber: string;
}

export interface LexicalResult {
  aisleNumber: string;
  confident: boolean;
}

interface CatalogItemInput {
  canonical_name: string;
  aisle_id: string;
}

/** Map of aisle `number` (department key) → concrete query terms. */
export type AliasMap = Record<string, string[]>;

/**
 * Normalize free text into ordered, meaningful tokens.
 *
 * - Lowercases and trims.
 * - Reverses the catalog's `category: qualifier` shape into a natural phrase
 *   (`fruit: fresh` → `fresh fruit`) so it embeds and matches like a user query.
 * - Splits on `:` `-` `/` `&` and whitespace, strips punctuation, drops stopwords.
 */
export function normalize(text: string): string[] {
  const lower = text.toLowerCase().trim();

  // Reverse "category: qualifier" → "qualifier category".
  let phrase = lower;
  const colonIdx = lower.indexOf(':');
  if (colonIdx !== -1) {
    const head = lower.slice(0, colonIdx);
    const tail = lower.slice(colonIdx + 1);
    phrase = `${tail} ${head}`;
  }

  return phrase
    .split(/[\s:\-/&,]+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ''))
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

/**
 * Build the full candidate set: one entry per catalog item AND one per alias
 * term. Catalog items with an unknown aisle (or no usable tokens) are skipped.
 */
export function buildCandidates(
  items: CatalogItemInput[],
  aliases: AliasMap,
  aisleById: Map<string, string>,
): Candidate[] {
  const candidates: Candidate[] = [];

  for (const item of items) {
    const aisleNumber = aisleById.get(item.aisle_id);
    if (!aisleNumber) continue;
    const tokens = normalize(item.canonical_name);
    if (tokens.length === 0) continue;
    candidates.push({ phrase: tokens.join(' '), tokens, aisleNumber });
  }

  for (const [aisleNumber, terms] of Object.entries(aliases)) {
    for (const term of terms) {
      const tokens = normalize(term);
      if (tokens.length === 0) continue;
      candidates.push({ phrase: tokens.join(' '), tokens, aisleNumber });
    }
  }

  return candidates;
}

/**
 * Deterministic lexical fast-path. Returns a confident hit when:
 *  - the normalized query exactly equals a candidate phrase, or
 *  - a single candidate is fully contained in the query (all of its tokens
 *    appear in the query) and no equally-specific candidate points elsewhere.
 *
 * Returns `null` when there is no usable match or the match is ambiguous, in
 * which case the caller should fall back to the semantic engine.
 */
export function lexicalMatch(query: string, candidates: Candidate[]): LexicalResult | null {
  const queryTokens = normalize(query);
  if (queryTokens.length === 0) return null;

  const queryPhrase = queryTokens.join(' ');
  const querySet = new Set(queryTokens);

  // 1. Exact normalized-phrase match.
  const exact = candidates.find((candidate) => candidate.phrase === queryPhrase);
  if (exact) return { aisleNumber: exact.aisleNumber, confident: true };

  // 2. Containment: the most specific candidate whose tokens all appear in the
  //    query (e.g. alias "mozzarella" inside "fresh mozzarella"). A tie between
  //    equally-specific candidates pointing at different aisles is ambiguous.
  let best: Candidate | null = null;
  let bestLen = 0;
  let ambiguous = false;

  for (const candidate of candidates) {
    if (candidate.tokens.length === 0) continue;
    if (!candidate.tokens.every((token) => querySet.has(token))) continue;

    if (candidate.tokens.length > bestLen) {
      best = candidate;
      bestLen = candidate.tokens.length;
      ambiguous = false;
    } else if (
      candidate.tokens.length === bestLen &&
      best &&
      candidate.aisleNumber !== best.aisleNumber
    ) {
      ambiguous = true;
    }
  }

  if (best && !ambiguous) return { aisleNumber: best.aisleNumber, confident: true };
  return null;
}

/**
 * Aggregate the top-k scored candidates by aisle (voting). The winning aisle is
 * the one whose top-k neighbours sum to the highest total; the returned `score`
 * is that aisle's single best neighbour, kept on the cosine-similarity scale so
 * it can be compared against {@link THRESHOLD}.
 */
export function aggregateTopK(
  scored: { aisleNumber: string; score: number }[],
  k: number,
): { aisleNumber: string; score: number } | null {
  if (scored.length === 0) return null;

  const top = [...scored].sort((a, b) => b.score - a.score).slice(0, k);

  const byAisle = new Map<string, { sum: number; max: number }>();
  for (const entry of top) {
    const current = byAisle.get(entry.aisleNumber) ?? { sum: 0, max: -Infinity };
    current.sum += entry.score;
    current.max = Math.max(current.max, entry.score);
    byAisle.set(entry.aisleNumber, current);
  }

  let winner: string | null = null;
  let bestSum = -Infinity;
  let winnerScore = -Infinity;
  for (const [aisleNumber, { sum, max }] of byAisle) {
    if (sum > bestSum) {
      bestSum = sum;
      winner = aisleNumber;
      winnerScore = max;
    }
  }

  return winner === null ? null : { aisleNumber: winner, score: winnerScore };
}
