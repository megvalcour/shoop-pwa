import { useState, useEffect, useRef, useCallback } from 'react';
import type { Aisle } from '@/db/schema';
import catalogData from '@/assets/aisles/oxford-62.json';
import aliasData from '@/assets/aisles/oxford-62-aliases.json';
import {
  buildCandidates,
  lexicalMatch,
  type AliasMap,
  type Candidate,
} from '@/services/classifier';

// Mirrors the message contract in `src/workers/aisleMatcher.worker.ts`.
type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: string; aisleNumber: string };

let candidatesCache: Candidate[] | null = null;

// Module-level worker singleton + bookkeeping, shared across every hook instance.
let worker: Worker | null = null;
let workerReady = false;
const readyListeners = new Set<() => void>();
const pendingClassifications = new Map<string, (aisleNumber: string) => void>();

// The candidate set (catalog phrases + aliases) is pure data and is built lazily
// without touching the model, so the lexical fast-path works before — or without
// ever — booting the worker.
function getCandidates(): Candidate[] {
  if (!candidatesCache) {
    const { aisles, items } = catalogData as {
      aisles: { id: string; number: string }[];
      items: { canonical_name: string; aisle_id: string }[];
    };
    const aisleById = new Map(aisles.map((a) => [a.id, a.number]));
    candidatesCache = buildCandidates(items, aliasData as AliasMap, aisleById);
  }
  return candidatesCache;
}

// Lazily boots the inference worker exactly once across the app. Nothing happens
// until the first caller primes it (e.g. on input blur), so the heavy WASM model
// never loads in the empty/initial state. All embedding work runs off the main
// thread; the worker posts `ready` once the catalog is embedded.
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/aisleMatcher.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (data.type === 'ready') {
        workerReady = true;
        for (const listener of readyListeners) listener();
      } else if (data.type === 'result') {
        const resolve = pendingClassifications.get(data.id);
        if (resolve) {
          pendingClassifications.delete(data.id);
          resolve(data.aisleNumber);
        }
      }
    };
    worker.postMessage({ type: 'load' });
  }
  return worker;
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
  /** Boots the inference worker (idempotent). Call on a real user intent signal —
   *  e.g. input blur — never on mount or while typing. */
  prime: () => void;
  classify: (itemName: string, aisles: Aisle[]) => Promise<string>;
  isReady: boolean;
}

export function useAisleMatcher(): AisleMatcherResult {
  const [isReady, setIsReady] = useState(workerReady);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (workerReady) {
      setIsReady(true);
      return;
    }
    const listener = () => {
      if (mountedRef.current) setIsReady(true);
    };
    readyListeners.add(listener);
    return () => {
      mountedRef.current = false;
      readyListeners.delete(listener);
    };
  }, []);

  const prime = useCallback(() => {
    if (workerReady) {
      setIsReady(true);
      return;
    }
    getWorker();
  }, []);

  const classify = async (itemName: string, aisles: Aisle[]): Promise<string> => {
    if (!itemName.trim()) return '';

    const candidates = getCandidates();
    const resolve = (aisleNumber: string): string =>
      aisles.find((a) => a.number === aisleNumber)?.id ?? '';

    // Lexical fast-path: deterministic, offline, no worker round-trip required.
    const lexical = lexicalMatch(itemName, candidates);
    if (lexical?.confident) return resolve(lexical.aisleNumber);

    // Semantic fallback: defer to the worker once it is ready. Until then return
    // '' — AddItemForm's deferred-reclassify effect retries when isReady flips.
    if (!workerReady) return '';

    const aisleNumber = await classifyViaWorker(itemName);
    if (!aisleNumber) return '';
    return resolve(aisleNumber);
  };

  return { prime, classify, isReady };
}
