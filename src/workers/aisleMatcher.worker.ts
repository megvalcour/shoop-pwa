// Aisle-matching inference worker (see ADR-0013).
//
// Runs the heavy work off the main thread: model init, catalog embedding, and
// per-query embedding. All scoring decisions still come from the pure functions
// in `@/services/classifier` (ADR-0011); the worker is data-only and never
// touches IndexedDB — it returns an aisle `number`, which the main thread
// resolves to an aisle id against the live `aisles` array.

import { pipeline } from '@huggingface/transformers';
import catalogData from '@/assets/aisles/oxford-62.json';
import aliasData from '@/assets/aisles/oxford-62-aliases.json';
import {
  buildCandidates,
  aggregateTopK,
  THRESHOLD,
  TOP_K,
  type AliasMap,
} from '@/services/classifier';

type EmbedPipeline = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

interface EmbeddedCandidate {
  aisleNumber: string;
  embedding: number[];
}

// Inbound messages the main thread posts to this worker.
type WorkerRequest =
  | { type: 'load' }
  | { type: 'classify'; id: string; phrase: string };

// Outbound messages this worker posts back. Mirrored in `useAisleMatcher.ts`.
type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; id: string; aisleNumber: string };

// The DOM lib types `self` as a Window; type the dedicated-worker surface we use
// explicitly so we don't need the WebWorker lib in tsconfig.
interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}
const ctx = self as unknown as WorkerScope;

let pipe: EmbedPipeline | null = null;
let catalogEmbeddings: EmbeddedCandidate[] = [];

function dotProduct(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

async function embed(text: string): Promise<number[]> {
  const output = await pipe!(text, { pooling: 'mean', normalize: true });
  return output.tolist()[0];
}

async function load(): Promise<void> {
  pipe = (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'fp32',
  })) as unknown as EmbedPipeline;

  const { aisles, items } = catalogData as {
    aisles: { id: string; number: string }[];
    items: { canonical_name: string; aisle_id: string }[];
  };
  const aisleById = new Map(aisles.map((a) => [a.id, a.number]));
  const candidates = buildCandidates(items, aliasData as AliasMap, aisleById);

  const entries: EmbeddedCandidate[] = [];
  for (const candidate of candidates) {
    entries.push({ aisleNumber: candidate.aisleNumber, embedding: await embed(candidate.phrase) });
  }
  catalogEmbeddings = entries;

  ctx.postMessage({ type: 'ready' });
}

async function classify(id: string, phrase: string): Promise<void> {
  const embedding = await embed(phrase);
  const scored = catalogEmbeddings.map((entry) => ({
    aisleNumber: entry.aisleNumber,
    score: dotProduct(embedding, entry.embedding),
  }));

  const winner = aggregateTopK(scored, TOP_K);
  const aisleNumber = !winner || winner.score < THRESHOLD ? '' : winner.aisleNumber;
  ctx.postMessage({ type: 'result', id, aisleNumber });
}

ctx.onmessage = (event) => {
  const data = event.data;
  if (data.type === 'load') {
    void load();
  } else if (data.type === 'classify') {
    void classify(data.id, data.phrase);
  }
};
