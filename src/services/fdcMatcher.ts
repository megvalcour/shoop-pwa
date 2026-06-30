/**
 * Main-thread driver for the FDC rerank worker (Eat tab, Phase 4 — ADR-0027).
 * Owns a module-singleton worker (mirrors `useAisleMatcher`'s pattern) and exposes
 * one async call: rerank a list of FDC candidates against an ingredient phrase.
 *
 * Reranking is best-effort and NON-BLOCKING (mirrors `useAisleMatcher.classify`):
 * the heavy embedding model loads in the worker the first time it is needed, and a
 * caller is NEVER made to wait on that cold load. Until the model has signalled
 * `ready` for the session, `rerankCandidates` warms the worker in the background
 * and resolves `null` immediately so the caller falls back to the FDC top hit. Once
 * the model is ready, later calls get the semantic refinement; if it never readies
 * (offline, no cached weights) the status latches `failed` and every call takes the
 * top-hit path. Correctness therefore rides on the manual-pick fallback, never on
 * the model being available (ADR-0027 Spike 1).
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
  | { type: 'ready' }
  | { type: 'load_failed' }
  | { type: 'result'; id: string; scored: ScoredCandidate[] }
  | { type: 'failed'; id: string };

/** Session lifecycle of the one-time model load (mirrors `MatcherStatus`). */
type ModelStatus = 'idle' | 'loading' | 'ready' | 'failed';

// A warm rerank embeds only a handful of short candidate descriptions, so it is
// sub-second; this bound just guards a wedged worker, not the cold load.
const RERANK_TIMEOUT_MS = 8_000;
// Bound the background warm-up so a worker that never readies (no cached model, no
// network) latches `failed` and stops being primed instead of retrying forever.
const WARMUP_TIMEOUT_MS = 20_000;

let worker: Worker | null = null;
let modelStatus: ModelStatus = 'idle';
let warmupTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<string, (scored: ScoredCandidate[] | null) => void>();

/** Resolve every queued rerank with `null` (top-hit fallback) on a worker crash. */
function failAllPending(): void {
  for (const [id, resolve] of pending) {
    pending.delete(id);
    resolve(null);
  }
}

function clearWarmupTimer(): void {
  if (warmupTimer !== null) {
    clearTimeout(warmupTimer);
    warmupTimer = null;
  }
}

function markFailed(): void {
  clearWarmupTimer();
  modelStatus = 'failed';
  failAllPending();
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/nutritionMatcher.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.type === 'ready') {
        clearWarmupTimer();
        modelStatus = 'ready';
        return;
      }
      if (data.type === 'load_failed') {
        markFailed();
        return;
      }
      const resolve = pending.get(data.id);
      if (!resolve) return;
      pending.delete(data.id);
      resolve(data.type === 'result' ? data.scored : null);
    };
    worker.onerror = () => markFailed();
  }
  return worker;
}

/**
 * Kick off the one-time background model load (mirrors `useAisleMatcher.prime`:
 * warm the worker on intent without blocking the caller on the cold load). No-op
 * once a load is in flight, has readied, or has latched failed.
 */
function ensureWarm(): void {
  if (modelStatus !== 'idle') return;
  const w = getWorker();
  modelStatus = 'loading';
  warmupTimer = setTimeout(markFailed, WARMUP_TIMEOUT_MS);
  w.postMessage({ type: 'warmup' });
}

/**
 * Rerank `candidates` by semantic similarity to `query`. Resolves the scored
 * candidates (highest first) once the model is ready for this session; otherwise
 * resolves `null` immediately (warming the model in the background) so the caller
 * falls back to the FDC top hit — the first, cold enrich is never blocked on the
 * model. An empty input resolves `[]`.
 */
export function rerankCandidates(
  query: string,
  candidates: RawCandidate[],
): Promise<ScoredCandidate[] | null> {
  if (candidates.length === 0) return Promise.resolve([]);
  if (modelStatus !== 'ready') {
    ensureWarm();
    return Promise.resolve(null);
  }
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
