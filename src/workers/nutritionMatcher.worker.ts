// FDC candidate reranking worker (Eat tab, Phase 4 — ADR-0027 Spike 1, ADR-0013).
//
// Runs the heavy embedding off the main thread to rerank USDA FDC search
// candidates against an ingredient phrase. It loads the SAME bundled
// `Xenova/all-MiniLM-L6-v2` model the aisle matcher uses — the transformers
// library serves the cached weights, so there is no second DOWNLOAD (a focused
// sibling worker is the ADR-0027 recommended shape). All scoring decisions come
// from the pure `@/services/fdcRerank` module; the worker is embed-only and never
// touches IndexedDB or the network beyond the one-time model fetch.
//
// Reranking is an internal refinement: on any model failure (offline, no cached
// model) the worker reports `failed` for the call and the main thread falls back
// to the FDC top hit, so correctness never depends on this worker succeeding.

import { pipeline } from '@huggingface/transformers';
import { rankBySimilarity, type ScoredCandidate } from '@/services/fdcRerank';

type EmbedPipeline = (
  text: string,
  opts: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

interface RawCandidate {
  fdcId: string;
  description: string;
}

type WorkerRequest = { type: 'rerank'; id: string; query: string; candidates: RawCandidate[] };

type WorkerResponse =
  | { type: 'result'; id: string; scored: ScoredCandidate[] }
  | { type: 'failed'; id: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}
const ctx = self as unknown as WorkerScope;

let pipe: EmbedPipeline | null = null;

async function ensurePipe(): Promise<EmbedPipeline> {
  if (!pipe) {
    pipe = (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      dtype: 'fp32',
    })) as unknown as EmbedPipeline;
  }
  return pipe;
}

async function embed(text: string): Promise<number[]> {
  const output = await pipe!(text, { pooling: 'mean', normalize: true });
  return output.tolist()[0];
}

async function rerank(id: string, query: string, candidates: RawCandidate[]): Promise<void> {
  try {
    await ensurePipe();
    const queryEmbedding = await embed(query);
    const embedded: Array<{ fdcId: string; description: string; embedding: number[] }> = [];
    for (const candidate of candidates) {
      embedded.push({
        fdcId: candidate.fdcId,
        description: candidate.description,
        embedding: await embed(candidate.description),
      });
    }
    ctx.postMessage({ type: 'result', id, scored: rankBySimilarity(queryEmbedding, embedded) });
  } catch {
    // WASM init failure, or a first-ever load with no cached model and no network.
    ctx.postMessage({ type: 'failed', id });
  }
}

ctx.onmessage = (event) => {
  const data = event.data;
  if (data.type === 'rerank') {
    void rerank(data.id, data.query, data.candidates);
  }
};
