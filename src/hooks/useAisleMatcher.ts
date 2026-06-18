import { useState, useEffect, useRef, useCallback } from 'react';
import { pipeline } from '@huggingface/transformers';
import type { Aisle } from '@/db/schema';
import catalogData from '@/assets/aisles/oxford-62.json';

type EmbedPipeline = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

interface CatalogEntry {
  item: string;
  aisle: string;
  embedding: number[];
}

let pipelinePromise: Promise<EmbedPipeline> | null = null;

let catalogReadyPromise: Promise<CatalogEntry[]> | null = null;

let catalogEmbeddingsCache: CatalogEntry[] | null = null;

// Lazily loads the model + catalog embeddings exactly once across the app.
// Nothing happens until the first caller invokes this (e.g. on input blur),
// so the heavy WASM model never loads in the empty/initial state.
function ensureLoaded(): Promise<CatalogEntry[]> {
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

async function buildCatalogEmbeddings(pipe: EmbedPipeline): Promise<CatalogEntry[]> {
  if (catalogEmbeddingsCache) return catalogEmbeddingsCache;

  const { aisles, items } = catalogData as {
    aisles: { id: string; number: string }[];
    items: { canonical_name: string; aisle_id: string }[];
  };

  const aisleById = new Map(aisles.map((a) => [a.id, a]));

  const entries: CatalogEntry[] = [];
  for (const item of items) {
    const aisle = aisleById.get(item.aisle_id);
    if (!aisle || !/^\d+$/.test(aisle.number)) continue;
    const embedding = await embed(pipe, item.canonical_name);
    entries.push({ item: item.canonical_name, aisle: aisle.number, embedding });
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
    if (!pipelinePromise || !catalogEmbeddingsCache) return '';

    const pipe = await pipelinePromise;
    const embedding = await embed(pipe, itemName);

    let bestScore = -Infinity;
    let bestAisleNumber = '';

    for (const entry of catalogEmbeddingsCache) {
      const score = dotProduct(embedding, entry.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestAisleNumber = entry.aisle;
      }
    }

    if (bestScore < 0.5 || !bestAisleNumber) return '';

    const match = aisles.find((a) => a.number === bestAisleNumber);
    return match?.id ?? '';
  };

  return { prime, classify, isReady };
}
