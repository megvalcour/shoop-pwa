import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet, onRequestOptions } from '../import-recipe';

const TOKEN = 'test-token';

const RECIPE_HTML =
  '<html><head><script type="application/ld+json">' +
  JSON.stringify({
    '@type': 'Recipe',
    name: 'Mock Pancakes',
    recipeIngredient: ['1 cup flour', '1 egg'],
  }) +
  '</script></head><body></body></html>';

/** Build the minimal Pages Function context the handler destructures. */
function context(url: string, init?: { token?: string | null }) {
  const headers = new Headers();
  if (init?.token !== null) headers.set('X-Shoop-Import', init?.token ?? TOKEN);
  return { request: new Request(url, { headers }), env: { IMPORT_TOKEN: TOKEN } };
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(RECIPE_HTML, { status: 200, headers: { 'content-type': 'text/html' } }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('onRequestGet', () => {
  it('returns { title, ingredients, sourceUrl } for a valid recipe URL', async () => {
    const res = await onRequestGet(
      context('https://example.com/api/import-recipe?url=https://recipes.example/pancakes'),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      title: 'Mock Pancakes',
      ingredients: ['1 cup flour', '1 egg'],
      sourceUrl: 'https://recipes.example/pancakes',
    });
  });

  it('returns 401 not_configured when IMPORT_TOKEN is unset', async () => {
    const req = new Request('https://example.com/api/import-recipe?url=https://recipes.example/x');
    const res = await onRequestGet({ request: req, env: {} });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'not_configured' });
  });

  it('returns 401 unauthorized when the token is missing or wrong', async () => {
    const res = await onRequestGet(
      context('https://example.com/api/import-recipe?url=https://recipes.example/x', {
        token: null,
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_url when the url param is missing', async () => {
    const res = await onRequestGet(context('https://example.com/api/import-recipe'));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_url' });
  });

  it('returns 400 invalid_url for a non-http scheme', async () => {
    const res = await onRequestGet(
      context('https://example.com/api/import-recipe?url=ftp://recipes.example/x'),
    );

    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_url for a private / loopback host (SSRF guard)', async () => {
    const blocked = [
      'http://localhost/admin',
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/',
    ];
    for (const target of blocked) {
      const res = await onRequestGet(
        context(`https://example.com/api/import-recipe?url=${encodeURIComponent(target)}`),
      );
      expect(res.status, target).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 422 no_recipe when the page has no Recipe JSON-LD', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body>nothing here</body></html>', { status: 200 }),
    );

    const res = await onRequestGet(
      context('https://example.com/api/import-recipe?url=https://recipes.example/blank'),
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'no_recipe' });
  });

  it('returns 502 fetch_failed when the upstream responds with an error status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));

    const res = await onRequestGet(
      context('https://example.com/api/import-recipe?url=https://recipes.example/down'),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'fetch_failed' });
  });

  it('returns 502 fetch_failed when the upstream fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));

    const res = await onRequestGet(
      context('https://example.com/api/import-recipe?url=https://recipes.example/err'),
    );

    expect(res.status).toBe(502);
  });

  it('does not reflect CORS for a non-localhost origin', async () => {
    // `Origin` is a forbidden request header (stripped by the fetch layer in the
    // test env), so we can only assert the negative case here: with no readable
    // localhost origin, the response carries no cross-origin allowance.
    const res = await onRequestGet(
      context('https://example.com/api/import-recipe?url=https://recipes.example/pancakes'),
    );

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('vary')).toBe('Origin');
  });
});

describe('onRequestOptions', () => {
  it('answers a preflight with 204', async () => {
    const req = new Request('https://example.com/api/import-recipe', { method: 'OPTIONS' });
    const res = await onRequestOptions({ request: req, env: { IMPORT_TOKEN: TOKEN } });

    expect(res.status).toBe(204);
    expect(res.headers.get('vary')).toBe('Origin');
  });
});
