import { useState, useEffect, useRef, useCallback } from 'react';
import type { Aisle } from '@/db/schema';
import { lexicalMatch, type Candidate } from '@/services/classifier';

// Mirrors the message contract in `src/workers/aisleMatcher.worker.ts`.
type WorkerResponse =
  | { type: 'ready' }
  | { type: 'error' }
  | { type: 'result'; id: string; aisleNumber: string };

interface SerializedCandidate {
  phrase: string;
  aisleNumber: string;
}

/** Lifecycle of the (per-store) matcher load attempt. `failed` covers a worker
 *  error or a readiness timeout; it is per-attempt, so a later `prime` retries. */
export type MatcherStatus = 'idle' | 'loading' | 'ready' | 'failed';

// How long to wait for a `ready` before declaring the load failed. Guards the
// worried edge — a worker that never readies (no cached model, no network) — so
// items resolve to Uncategorized rather than a permanent spinner.
const READINESS_TIMEOUT_MS = 20_000;

// Module-level worker singleton + bookkeeping, shared across every hook instance.
let worker: Worker | null = null;
// The store key the worker is currently embedding/embedded for, and the key it
// has finished embedding (`ready`). They differ while a re-embed is in flight.
let loadedStoreKey: string | null = null;
let readyStoreKey: string | null = null;
let matcherStatus: MatcherStatus = 'idle';
let readinessTimer: ReturnType<typeof setTimeout> | null = null;
const readyListeners = new Set<() => void>();
const statusListeners = new Set<() => void>();
const pendingClassifications = new Map<string, (aisleNumber: string) => void>();

function setStatus(status: MatcherStatus): void {
  if (matcherStatus === status) return;
  matcherStatus = status;
  for (const listener of statusListeners) listener();
}

// Resolve every queued classification with '' — used when a load fails so callers
// (the deferred reclassify loop) settle their items instead of hanging.
function failPendingClassifications(): void {
  for (const [id, resolve] of pendingClassifications) {
    pendingClassifications.delete(id);
    resolve('');
  }
}

function clearReadinessTimer(): void {
  if (readinessTimer !== null) {
    clearTimeout(readinessTimer);
    readinessTimer = null;
  }
}

function markFailed(): void {
  clearReadinessTimer();
  setStatus('failed');
  failPendingClassifications();
}

// Lazily boots the inference worker exactly once across the app. The heavy WASM
// model loads inside the worker on the first `load`; nothing happens until a
// caller primes it with an active store's candidate set.
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/aisleMatcher.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.type === 'ready') {
        clearReadinessTimer();
        readyStoreKey = loadedStoreKey;
        setStatus('ready');
        for (const listener of readyListeners) listener();
      } else if (data.type === 'error') {
        markFailed();
      } else if (data.type === 'result') {
        const resolve = pendingClassifications.get(data.id);
        if (resolve) {
          pendingClassifications.delete(data.id);
          resolve(data.aisleNumber);
        }
      }
    };
    worker.onerror = () => {
      markFailed();
    };
  }
  return worker;
}

// Boot (or re-embed) the worker for `storeKey`. Re-embeds only when the active
// store changed, so a store switch remaps the candidate set off the main thread.
// A real load enters `loading` and arms the readiness timeout; a `prime` after a
// `failed` attempt clears `loadedStoreKey` so the same store retries.
function ensureLoaded(storeKey: string, candidates: SerializedCandidate[]): void {
  const w = getWorker();
  if (matcherStatus === 'failed' && loadedStoreKey === storeKey) {
    loadedStoreKey = null; // allow a retry of the same store after a failure.
  }
  if (loadedStoreKey !== storeKey) {
    loadedStoreKey = storeKey;
    readyStoreKey = null;
    clearReadinessTimer();
    setStatus('loading');
    readinessTimer = setTimeout(markFailed, READINESS_TIMEOUT_MS);
    w.postMessage({ type: 'load', candidates });
  }
}

// Embed + score a query off the main thread, correlating the reply by id.
function classifyViaWorker(phrase: string): Promise<string> {
  const w = getWorker();
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    pendingClassifications.set(id, resolve);
    w.postMessage({ type: 'classify', id, phrase });
  });
}

export interface AisleMatcherResult {
  /** Boots/re-embeds the inference worker for the active store (idempotent per
   *  store). Call on a real user intent signal — e.g. input blur — never on
   *  mount or while typing. No-op until the store + candidates are known. */
  prime: () => void;
  classify: (itemName: string, aisles: Aisle[]) => Promise<string>;
  isReady: boolean;
  /** The active load attempt's lifecycle (per-store). `isReady` is derived from
   *  it (`status === 'ready'` for this store). */
  status: MatcherStatus;
}

/**
 * Store-parametrized aisle matcher (ADR-0015). `storeKey` identifies the active
 * store (its id); `candidates` is that store's candidate set (item→aisle map +
 * aliases). The lexical fast-path runs against `candidates` on the main thread;
 * the semantic fallback defers to the worker once it is `ready` for this store.
 */
export function useAisleMatcher(
  storeKey: string | undefined,
  candidates: Candidate[],
): AisleMatcherResult {
  const [, forceTick] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const listener = () => {
      if (mountedRef.current) forceTick((t) => t + 1);
    };
    readyListeners.add(listener);
    statusListeners.add(listener);
    return () => {
      mountedRef.current = false;
      readyListeners.delete(listener);
      statusListeners.delete(listener);
    };
  }, []);

  const isReady = storeKey != null && readyStoreKey === storeKey && matcherStatus === 'ready';

  const prime = useCallback(() => {
    if (!storeKey || candidates.length === 0) return;
    ensureLoaded(
      storeKey,
      candidates.map((c) => ({ phrase: c.phrase, aisleNumber: c.aisleNumber })),
    );
    // Re-render so isReady reflects an immediate same-store ready state.
    forceTick((t) => t + 1);
  }, [storeKey, candidates]);

  const classify = async (itemName: string, aisles: Aisle[]): Promise<string> => {
    if (!itemName.trim()) return '';

    const resolve = (aisleNumber: string): string =>
      aisles.find((a) => a.number === aisleNumber)?.id ?? '';

    // Lexical fast-path: deterministic, offline, no worker round-trip required.
    const lexical = lexicalMatch(itemName, candidates);
    if (lexical?.confident) return resolve(lexical.aisleNumber);

    // Semantic fallback: defer to the worker once it is ready for this store.
    // Until then return '' — the deferred-reclassify effect retries when the
    // worker becomes ready (or the active store changes).
    if (!isReady) return '';

    const aisleNumber = await classifyViaWorker(itemName);
    if (!aisleNumber) return '';
    return resolve(aisleNumber);
  };

  return { prime, classify, isReady, status: matcherStatus };
}
