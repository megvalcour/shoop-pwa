/**
 * Main-thread driver for the FDC rerank worker (Eat tab, Phase 4 — ADR-0027).
 * Owns a module-singleton worker (mirrors `useAisleMatcher`'s pattern) and exposes
 * one async call: rerank a list of FDC candidates against an ingredient phrase.
 *
 * Reranking is best-effort. If the model never loads (offline, no cached weights)
 * or the call exceeds the timeout, this resolves `null` and the caller falls back
 * to the FDC top hit — so enrichment correctness rides on the manual-pick
 * fallback, never on the model being available (ADR-0027 Spike 1).
 *
 * Kept out of `useNutrition.ts` so the hook's tests can `vi.mock` it and run
 * without spinning up a Worker.
 */

import type { ScoredCandidate } from '@/services/fdcRerank';

interface RawCandidate {
  fdcId: string;
  description: string;
}

type WorkerResponse =
  | { type: 'result'; id: string; scored: ScoredCandidate[] }
  | { type: 'failed'; id: string };

// Bound the wait so a worker that never readies (no cached model, no network)
// resolves to the top-hit fallback instead of hanging the enrich flow.
const RERANK_TIMEOUT_MS = 20_000;

let worker: Worker | null = null;
const pending = new Map<string, (scored: ScoredCandidate[] | null) => void>();

/** Resolve every queued rerank with `null` (top-hit fallback) on a worker crash. */
function failAllPending(): void {
  for (const [id, resolve] of pending) {
    pending.delete(id);
    resolve(null);
  }
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/nutritionMatcher.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      const resolve = pending.get(data.id);
      if (!resolve) return;
      pending.delete(data.id);
      resolve(data.type === 'result' ? data.scored : null);
    };
    worker.onerror = () => failAllPending();
  }
  return worker;
}

/**
 * Rerank `candidates` by semantic similarity to `query`. Resolves the scored
 * candidates (highest first), or `null` when the model is unavailable / times out
 * (caller falls back to the FDC top hit). An empty input resolves `[]`.
 */
export function rerankCandidates(
  query: string,
  candidates: RawCandidate[],
): Promise<ScoredCandidate[] | null> {
  if (candidates.length === 0) return Promise.resolve([]);
  const w = getWorker();
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, RERANK_TIMEOUT_MS);
    pending.set(id, (scored) => {
      clearTimeout(timer);
      resolve(scored);
    });
    w.postMessage({ type: 'rerank', id, query, candidates });
  });
}
