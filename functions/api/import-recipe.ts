/**
 * `/api/import-recipe` — Cloudflare Pages Function (ADR-0019).
 *
 * A stateless, read-only fetch/parse proxy for recipe import. It validates the
 * target URL, enforces the shared import token, fetches the page under strict
 * SSRF / size / time budgets, and hands the HTML to the pure
 * {@link parseRecipeJsonLd} extractor. It stores nothing and holds no secrets
 * beyond the env-bound token — so even a full compromise leaks only "free
 * proxy + daily quota" (see ADR-0019's security posture).
 *
 * Response contract:
 *   200 → { title, ingredients, sourceUrl }
 *   400 → { error: 'invalid_url' }       — missing / malformed / blocked URL
 *   401 → { error: 'not_configured' }    — IMPORT_TOKEN not bound to the project
 *   401 → { error: 'unauthorized' }      — token missing / mismatched
 *   422 → { error: 'no_recipe' }         — no parseable Recipe JSON-LD
 *   502 → { error: 'fetch_failed' }      — upstream fetch failed / over budget
 */

import { parseRecipeJsonLd } from '../_lib/parseRecipeJsonLd';

interface Env {
  /** Shared import token, bound in the Cloudflare dashboard. Never committed. */
  IMPORT_TOKEN?: string;
}

// Minimal Pages Function typings — avoids pulling in @cloudflare/workers-types.
interface PagesFunctionContext<E> {
  request: Request;
  env: E;
}
type PagesFunction<E> = (context: PagesFunctionContext<E>) => Response | Promise<Response>;

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // ~2 MB
const MAX_REDIRECTS = 5;
const TOKEN_HEADER = 'X-Shoop-Import';
const USER_AGENT =
  'Mozilla/5.0 (compatible; ShoopRecipeImport/1.0; +https://github.com/megvalcour/shoop-pwa)';

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

/** Block loopback / private / link-local hosts to prevent SSRF to internals. */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((n) => n > 255)) return true; // malformed → block
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }

  // IPv6 loopback (::1), unspecified (::), unique-local (fc../fd..), link-local (fe80..).
  if (host === '::1' || host === '::') return true;
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) return true;

  return false;
}

function isAllowedUrl(url: URL): boolean {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false; // no credential-bearing URLs
  return !isBlockedHost(url.hostname);
}

/** Read a response body, aborting once it exceeds {@link MAX_RESPONSE_BYTES}. */
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
 * Fetch the target HTML under a hard timeout, following redirects manually so
 * each hop is re-checked against {@link isAllowedUrl} (a redirect could point at
 * an internal host). Returns `null` on any failure or budget breach.
 */
async function fetchRecipeHtml(initialUrl: URL): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let currentUrl = initialUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await fetch(currentUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return null;
        let next: URL;
        try {
          next = new URL(location, currentUrl);
        } catch {
          return null;
        }
        if (!isAllowedUrl(next)) return null;
        currentUrl = next;
        continue;
      }

      if (!response.ok) return null;
      return await readCapped(response);
    }
    return null; // too many redirects
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const origin = request.headers.get('Origin');

  // Token first: drop drive-by scanners before doing any work (ADR-0019 #2).
  const expected = env.IMPORT_TOKEN;
  if (!expected) return json({ error: 'not_configured' }, 401, origin);
  if (request.headers.get(TOKEN_HEADER) !== expected) {
    return json({ error: 'unauthorized' }, 401, origin);
  }

  const target = new URL(request.url).searchParams.get('url');
  if (!target) return json({ error: 'invalid_url' }, 400, origin);

  let recipeUrl: URL;
  try {
    recipeUrl = new URL(target);
  } catch {
    return json({ error: 'invalid_url' }, 400, origin);
  }
  if (!isAllowedUrl(recipeUrl)) return json({ error: 'invalid_url' }, 400, origin);

  const html = await fetchRecipeHtml(recipeUrl);
  if (html === null) return json({ error: 'fetch_failed' }, 502, origin);

  const recipe = parseRecipeJsonLd(html);
  if (!recipe) return json({ error: 'no_recipe' }, 422, origin);

  return json(
    { title: recipe.title, ingredients: recipe.ingredients, sourceUrl: recipeUrl.toString() },
    200,
    origin,
  );
};

export const onRequestOptions: PagesFunction<Env> = ({ request }) =>
  new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
