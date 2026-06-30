// Spike 1 (Eat Phase 0): FDC match quality — does embedding-rerank beat plain
// FDC text search at landing the *right* food for an imported ingredient?
//
// For each fixture ingredient (ingredients.json):
//   1. Query FDC /foods/search with the normalized noun phrase.
//   2. plain    = top search hit.
//   3. reranked = embed the query + each candidate description with
//                 Xenova/all-MiniLM-L6-v2 (ADR-0003, same model the app loads),
//                 pick max cosine similarity.
//   4. Score each against intendedFood by token overlap (a heuristic; the
//      printed table is meant to be eyeballed for the final verdict).
//
// Tallies plain-hit-rate vs reranked-hit-rate over the fixture and writes
// match-results.json.
//
// Requires:
//   - FDC_API_KEY env (free from https://fdc.nal.usda.gov/api-key-signup.html;
//     DEMO_KEY works at low volume). Never commit the key.
//   - Network reach to api.nal.usda.gov AND huggingface.co. In some sandboxes
//     egress policy blocks these — see README / FINDINGS.
//   - Node 22+ run with NODE_USE_ENV_PROXY=1 so fetch honors HTTPS_PROXY.
//
// Run:
//   FDC_API_KEY=DEMO_KEY NODE_USE_ENV_PROXY=1 node scripts/spikes/eat-fdc/fdc-match.mjs
//
// Throwaway spike code — NOT imported by src/.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const API_KEY = process.env.FDC_API_KEY;
const TOP_N = 10; // candidates to rerank

if (!API_KEY) {
  console.error('Set FDC_API_KEY (DEMO_KEY works at low volume). Aborting.');
  process.exit(2);
}

const { items } = JSON.parse(readFileSync(resolve(here, 'ingredients.json'), 'utf8'));

function tokens(s) {
  return new Set(
    s.toLowerCase().replace(/[(),]/g, ' ').split(/\s+/).filter((t) => t.length > 2),
  );
}
// Heuristic hit test: most intendedFood tokens appear in the candidate.
function isHit(candidateDesc, intendedFood) {
  if (!candidateDesc) return false;
  const cand = tokens(candidateDesc);
  const want = [...tokens(intendedFood)];
  const overlap = want.filter((t) => cand.has(t)).length;
  return overlap / Math.max(want.length, 1) >= 0.5;
}

async function fdcSearch(query) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(
    API_KEY,
  )}&query=${encodeURIComponent(query)}&pageSize=${TOP_N}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`FDC ${res.status} for "${query}"`);
  const data = await res.json();
  return (data.foods || []).map((f) => f.description);
}

// Lazy-load the embedding model so a pure connectivity failure to FDC fails
// fast before paying the model download.
let embedder = null;
async function getEmbedder() {
  if (embedder) return embedder;
  const { pipeline } = await import('@huggingface/transformers');
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  return embedder;
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
async function embed(text) {
  const e = await getEmbedder();
  const out = await e(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

async function rerank(query, candidates) {
  if (candidates.length === 0) return null;
  const qv = await embed(query);
  const scored = [];
  for (const c of candidates) scored.push([c, cosine(qv, await embed(c))]);
  scored.sort((a, b) => b[1] - a[1]);
  return scored[0][0];
}

const rows = [];
let plainHits = 0;
let rerankHits = 0;

for (const item of items) {
  let candidates = [];
  let err = null;
  try {
    candidates = await fdcSearch(item.normalized);
  } catch (e) {
    err = e.message;
  }
  const plain = candidates[0] ?? null;
  let reranked = null;
  if (!err) {
    try {
      reranked = await rerank(item.normalized, candidates);
    } catch (e) {
      err = `rerank: ${e.message}`;
    }
  }
  const plainHit = isHit(plain, item.intendedFood);
  const rerankHit = isHit(reranked, item.intendedFood);
  if (plainHit) plainHits++;
  if (rerankHit) rerankHits++;
  rows.push({
    raw: item.raw,
    query: item.normalized,
    intendedFood: item.intendedFood,
    plain,
    plainHit,
    reranked,
    rerankHit,
    error: err,
  });
  console.log(
    `${plainHit ? '✓' : '✗'}plain ${rerankHit ? '✓' : '✗'}rerank  ${item.normalized}` +
      (err ? `  [ERR ${err}]` : `\n      plain:   ${plain}\n      rerank:  ${reranked}`),
  );
}

const n = items.length;
const summary = {
  n,
  plainHitRate: +(plainHits / n).toFixed(3),
  rerankHitRate: +(rerankHits / n).toFixed(3),
  rerankDelta: +((rerankHits - plainHits) / n).toFixed(3),
};
writeFileSync(resolve(here, 'match-results.json'), JSON.stringify({ summary, rows }, null, 2));

console.log('\n' + '─'.repeat(60));
console.log(`n=${n}`);
console.log(`plain  top-hit accuracy: ${(summary.plainHitRate * 100).toFixed(0)}%  (${plainHits}/${n})`);
console.log(`rerank top-hit accuracy: ${(summary.rerankHitRate * 100).toFixed(0)}%  (${rerankHits}/${n})`);
console.log(`rerank delta:            ${(summary.rerankDelta * 100).toFixed(0)} pts`);
console.log('\nVERDICT GUIDE: delta >= +10pts → ship embedding-rerank (Phase 4).');
console.log('Smaller/zero delta → plain top-hit + manual-pick fallback suffices.');
console.log('Wrote match-results.json');
