/**
 * `/api/nutrition` — Cloudflare Pages Function (ADR-0027).
 *
 * A stateless, read-only proxy to USDA FoodData Central (FDC). It holds the real
 * `FDC_API_KEY` server-side, is gated by the shared `X-Shoop-Nutrition` token,
 * and exposes two operations behind a single endpoint:
 *
 *   ?op=search&q=<phrase>  → FDC `/foods/search` → a trimmed candidate list
 *                            `[{ fdcId, description, dataType }]` for the client
 *                            to rerank. No nutrient parsing (search hits are noisy).
 *   ?op=detail&fdcId=<id>  → FDC `/food/{id}` → `parseFdcFood` → one nutrient panel.
 *                            This is the payload the client caches.
 *
 * SECURITY (ADR-0027): unlike `/api/import-recipe`, this function talks to ONE
 * fixed host. The request URL is ALWAYS built here from a constant FDC base plus a
 * sanitized query / numeric id — no user-supplied URL or host ever reaches
 * `fetch`, so there is no SSRF surface. `https`-only, redirects rejected, capped
 * body read, hard timeout. `FDC_API_KEY` is read from env and attached
 * server-side; it is never echoed in a response or error.
 *
 * Response contract (typed JSON, mirrors `/api/import-recipe`):
 *   200 → search: { candidates: [{ fdcId, description, dataType }] }
 *   200 → detail: FdcNutrientPanel
 *   400 → { error: 'invalid_query' }    — missing/blank q, bad fdcId, unknown op
 *   401 → { error: 'not_configured' }   — FDC_API_KEY or NUTRITION_TOKEN unbound
 *   401 → { error: 'unauthorized' }     — token missing / mismatched
 *   422 → { error: 'no_match' }         — FDC returned nothing usable
 *   502 → { error: 'fetch_failed' }     — upstream fetch failed / over budget
 */

import { parseFdcFood } from '../_lib/parseFdcFood';

interface Env {
  /** Real USDA FDC API key — a genuine secret. Bound in the dashboard, never committed. */
  FDC_API_KEY?: string;
  /** Shared nutrition token, mirrors IMPORT_TOKEN. Drops drive-by scanners. */
  NUTRITION_TOKEN?: string;
}

// Minimal Pages Function typings — avoids pulling in @cloudflare/workers-types.
interface PagesFunctionContext<E> {
  request: Request;
  env: E;
}
type PagesFunction<E> = (context: PagesFunctionContext<E>) => Response | Promise<Response>;

const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1';
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // ~2 MB
const SEARCH_PAGE_SIZE = 10;
// Constrain to the datasets `parseFdcFood` understands (per-100 g panels).
const SEARCH_DATA_TYPES = 'Foundation,SR Legacy,Branded';
const TOKEN_HEADER = 'X-Shoop-Nutrition';

/** Reflect CORS only for local dev origins; production calls are same-origin. */
function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { vary: 'Origin' };
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'GET, OPTIONS';
    headers['access-control-allow-headers'] = `${TOKEN_HEADER}, Content-Type`;
  }
  return headers;
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}

/** Read a response body, returning `null` once it exceeds {@link MAX_RESPONSE_BYTES}. */
async function readCapped(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.length > MAX_RESPONSE_BYTES ? null : text;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(merged);
}

/**
 * GET a fixed-host FDC URL under a hard timeout. The URL is built by the caller
 * from {@link FDC_BASE}, so no user input reaches the destination. Redirects are
 * rejected (a 3xx from the trusted host is unexpected). Returns the parsed JSON,
 * or `null` on any failure / non-2xx / over-budget body.
 */
async function fetchFdc(url: URL): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (response.status >= 300 && response.status < 400) return null; // no redirects
    if (!response.ok) return null;
    const body = await readCapped(response);
    if (body === null) return null;
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface SearchCandidate {
  fdcId: string;
  description: string;
  dataType: string;
}

/** Trim an FDC `/foods/search` response to the candidate list the client reranks. */
function toCandidates(searchJson: unknown): SearchCandidate[] {
  const foods = (searchJson as { foods?: unknown })?.foods;
  if (!Array.isArray(foods)) return [];
  const candidates: SearchCandidate[] = [];
  for (const food of foods) {
    const id = (food as { fdcId?: unknown })?.fdcId;
    const description = (food as { description?: unknown })?.description;
    if ((typeof id !== 'number' && typeof id !== 'string') || typeof description !== 'string') {
      continue;
    }
    const dataType = (food as { dataType?: unknown })?.dataType;
    candidates.push({
      fdcId: `${id}`,
      description,
      dataType: typeof dataType === 'string' ? dataType : '',
    });
  }
  return candidates;
}

async function handleSearch(
  query: string,
  apiKey: string,
  origin: string | null,
): Promise<Response> {
  const q = query.trim();
  if (q.length === 0) return json({ error: 'invalid_query' }, 400, origin);

  const url = new URL(`${FDC_BASE}/foods/search`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', q);
  url.searchParams.set('pageSize', String(SEARCH_PAGE_SIZE));
  url.searchParams.set('dataType', SEARCH_DATA_TYPES);

  const result = await fetchFdc(url);
  if (result === null) return json({ error: 'fetch_failed' }, 502, origin);

  const candidates = toCandidates(result);
  if (candidates.length === 0) return json({ error: 'no_match' }, 422, origin);

  return json({ candidates }, 200, origin);
}

async function handleDetail(
  fdcId: string,
  apiKey: string,
  origin: string | null,
): Promise<Response> {
  // Numeric-id allowlist — the only thing from the request that touches the path.
  if (!/^\d+$/.test(fdcId)) return json({ error: 'invalid_query' }, 400, origin);

  const url = new URL(`${FDC_BASE}/food/${fdcId}`);
  url.searchParams.set('api_key', apiKey);

  const result = await fetchFdc(url);
  if (result === null) return json({ error: 'fetch_failed' }, 502, origin);

  const panel = parseFdcFood(result);
  if (!panel) return json({ error: 'no_match' }, 422, origin);

  return json(panel, 200, origin);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const origin = request.headers.get('Origin');

  // Token + key first: drop drive-by scanners before any work (ADR-0019 #2).
  const expected = env.NUTRITION_TOKEN;
  const apiKey = env.FDC_API_KEY;
  if (!expected || !apiKey) return json({ error: 'not_configured' }, 401, origin);
  if (request.headers.get(TOKEN_HEADER) !== expected) {
    return json({ error: 'unauthorized' }, 401, origin);
  }

  const params = new URL(request.url).searchParams;
  const op = params.get('op');

  if (op === 'search') return handleSearch(params.get('q') ?? '', apiKey, origin);
  if (op === 'detail') return handleDetail(params.get('fdcId') ?? '', apiKey, origin);

  return json({ error: 'invalid_query' }, 400, origin);
};

export const onRequestOptions: PagesFunction<Env> = ({ request }) =>
  new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
