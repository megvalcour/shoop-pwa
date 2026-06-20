import { useState, useEffect, useRef, useCallback } from 'react';
import { pipeline } from '@huggingface/transformers';
import type { Aisle } from '@/db/schema';
import catalogData from '@/assets/aisles/oxford-62.json';
import aliasData from '@/assets/aisles/oxford-62-aliases.json';
import {
  buildCandidates,
  lexicalMatch,
  aggregateTopK,
  THRESHOLD,
  TOP_K,
  type AliasMap,
  type Candidate,
} from '@/services/classifier';

type EmbedPipeline = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

interface EmbeddedCandidate {
  aisleNumber: string;
  embedding: number[];
}

let pipelinePromise: Promise<EmbedPipeline> | null = null;

let catalogReadyPromise: Promise<EmbeddedCandidate[]> | null = null;

let catalogEmbeddingsCache: EmbeddedCandidate[] | null = null;

let candidatesCache: Candidate[] | null = null;

// The candidate set (catalog phrases + aliases) is pure data and is built lazily
// without touching the model, so the lexical fast-path works before — or without
// ever — loading the WASM pipeline.
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

// Lazily loads the model + catalog embeddings exactly once across the app.
// Nothing happens until the first caller invokes this (e.g. on input blur),
// so the heavy WASM model never loads in the empty/initial state.
function ensureLoaded(): Promise<EmbeddedCandidate[]> {
  if (!pipelinePromise) {
    pipelinePromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'fp32',
    }) as unknown as Promise<EmbedPipeline>;
  }
  if (!catalogReadyPromise) {
    catalogReadyPromise = pipelinePromise.then((pipe) => buildCatalogEmbeddings(pipe));
  }
  return catalogReadyPromise;
}

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

async function embed(pipe: EmbedPipeline, text: string): Promise<number[]> {
  const output = await pipe(text, { pooling: 'mean', normalize: true });
  return output.tolist()[0];
}

async function buildCatalogEmbeddings(pipe: EmbedPipeline): Promise<EmbeddedCandidate[]> {
  if (catalogEmbeddingsCache) return catalogEmbeddingsCache;

  const entries: EmbeddedCandidate[] = [];
  for (const candidate of getCandidates()) {
    const embedding = await embed(pipe, candidate.phrase);
    entries.push({ aisleNumber: candidate.aisleNumber, embedding });
  }

  catalogEmbeddingsCache = entries;
  return entries;
}

export interface AisleMatcherResult {
  /** Begins loading the model + catalog embeddings (idempotent). Call on a real
   *  user intent signal — e.g. input blur — never on mount or while typing. */
  prime: () => void;
  classify: (itemName: string, aisles: Aisle[]) => Promise<string>;
  isReady: boolean;
}

export function useAisleMatcher(): AisleMatcherResult {
  const [isReady, setIsReady] = useState(catalogEmbeddingsCache !== null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const prime = useCallback(() => {
    if (catalogEmbeddingsCache !== null) {
      setIsReady(true);
      return;
    }
    ensureLoaded().then(() => {
      if (mountedRef.current) setIsReady(true);
    });
  }, []);

  const classify = async (itemName: string, aisles: Aisle[]): Promise<string> => {
    if (!itemName.trim()) return '';

    const candidates = getCandidates();
    const resolve = (aisleNumber: string): string =>
      aisles.find((a) => a.number === aisleNumber)?.id ?? '';

    // Lexical fast-path: deterministic, offline, no model required.
    const lexical = lexicalMatch(itemName, candidates);
    if (lexical?.confident) return resolve(lexical.aisleNumber);

    // Semantic fallback: embed the query and vote across the top-k neighbours.
    if (!pipelinePromise || !catalogEmbeddingsCache) return '';

    const pipe = await pipelinePromise;
    const embedding = await embed(pipe, itemName);

    const scored = catalogEmbeddingsCache.map((entry) => ({
      aisleNumber: entry.aisleNumber,
      score: dotProduct(embedding, entry.embedding),
    }));

    const winner = aggregateTopK(scored, TOP_K);
    if (!winner || winner.score < THRESHOLD) return '';

    return resolve(winner.aisleNumber);
  };

  return { prime, classify, isReady };
}
