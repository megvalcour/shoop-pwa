import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequestGet, onRequestOptions } from '../nutrition';

const TOKEN = 'test-token';
const API_KEY = 'fdc-secret-key';

const SEARCH_JSON = {
  foods: [
    { fdcId: 169967, description: 'Onions, raw', dataType: 'Foundation' },
    { fdcId: '171705', description: 'Garlic, raw', dataType: 'SR Legacy' },
    { description: 'no id — skipped' },
  ],
};

const FOOD_JSON = {
  fdcId: 169967,
  description: 'Onions, raw',
  foodNutrients: [
    { nutrient: { id: 1008, unitName: 'KCAL' }, amount: 40 },
    { nutrient: { id: 1003, unitName: 'G' }, amount: 1.1 },
  ],
};

/** Build the minimal Pages Function context the handler destructures. */
function context(url: string, init?: { token?: string | null; env?: Record<string, string> }) {
  const headers = new Headers();
  if (init?.token !== null) headers.set('X-Shoop-Nutrition', init?.token ?? TOKEN);
  const env = init?.env ?? { NUTRITION_TOKEN: TOKEN, FDC_API_KEY: API_KEY };
  return { request: new Request(url, { headers }), env };
}

/** Capture the URL passed to fetch + return a JSON body. */
function mockFetchJson(body: unknown, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  mockFetchJson(SEARCH_JSON);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('onRequestGet — auth + routing guards', () => {
  it('returns 401 not_configured when the token is unbound', async () => {
    const res = await onRequestGet(
      context('https://x/api/nutrition?op=search&q=onion', { env: { FDC_API_KEY: API_KEY } }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 401 not_configured when the FDC key is unbound', async () => {
    const res = await onRequestGet(
      context('https://x/api/nutrition?op=search&q=onion', { env: { NUTRITION_TOKEN: TOKEN } }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'not_configured' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 401 unauthorized when the token is missing or wrong', async () => {
    const res = await onRequestGet(
      context('https://x/api/nutrition?op=search&q=onion', { token: null }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 400 invalid_query for an unknown op', async () => {
    const res = await onRequestGet(context('https://x/api/nutrition?op=bogus'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_query' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('onRequestGet — search', () => {
  it('returns trimmed candidates and never leaks the api key to the client', async () => {
    const res = await onRequestGet(context('https://x/api/nutrition?op=search&q=onion'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      candidates: [
        { fdcId: '169967', description: 'Onions, raw', dataType: 'Foundation' },
        { fdcId: '171705', description: 'Garlic, raw', dataType: 'SR Legacy' },
      ],
    });
  });

  it('only ever fetches the fixed FDC host, with the key attached server-side', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(SEARCH_JSON), { status: 200 }),
    );
    await onRequestGet(context('https://x/api/nutrition?op=search&q=on%20ions'));
    const called = String(spy.mock.calls[0][0]);
    expect(called.startsWith('https://api.nal.usda.gov/fdc/v1/foods/search')).toBe(true);
    expect(called).toContain('api_key=fdc-secret-key');
    expect(called).toContain('query=on+ions');
  });

  it('returns 400 invalid_query for a blank q', async () => {
    const res = await onRequestGet(context('https://x/api/nutrition?op=search&q=%20%20'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_query' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 422 no_match when FDC returns no foods', async () => {
    mockFetchJson({ foods: [] });
    const res = await onRequestGet(context('https://x/api/nutrition?op=search&q=zzz'));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'no_match' });
  });

  it('returns 502 fetch_failed when the upstream errors', async () => {
    mockFetchJson('nope', 500);
    const res = await onRequestGet(context('https://x/api/nutrition?op=search&q=onion'));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'fetch_failed' });
  });

  it('returns 502 fetch_failed when the upstream fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const res = await onRequestGet(context('https://x/api/nutrition?op=search&q=onion'));
    expect(res.status).toBe(502);
  });
});

describe('onRequestGet — detail', () => {
  it('returns a parsed nutrient panel for a valid fdcId', async () => {
    mockFetchJson(FOOD_JSON);
    const res = await onRequestGet(context('https://x/api/nutrition?op=detail&fdcId=169967'));
    expect(res.status).toBe(200);
    const panel = (await res.json()) as { fdc_id: string; per100g: { energyKcal: number } };
    expect(panel.fdc_id).toBe('169967');
    expect(panel.per100g.energyKcal).toBe(40);
  });

  it('builds the food URL from the numeric id on the fixed host', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(FOOD_JSON), { status: 200 }),
    );
    await onRequestGet(context('https://x/api/nutrition?op=detail&fdcId=169967'));
    const called = String(spy.mock.calls[0][0]);
    expect(called.startsWith('https://api.nal.usda.gov/fdc/v1/food/169967')).toBe(true);
  });

  it('returns 400 invalid_query for a non-numeric fdcId (no fetch)', async () => {
    const res = await onRequestGet(
      context('https://x/api/nutrition?op=detail&fdcId=../../etc/passwd'),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_query' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 422 no_match when the food has no usable id', async () => {
    mockFetchJson({ description: 'broken' });
    const res = await onRequestGet(context('https://x/api/nutrition?op=detail&fdcId=1'));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'no_match' });
  });
});

describe('onRequestOptions', () => {
  it('answers a preflight with 204', async () => {
    const req = new Request('https://x/api/nutrition', { method: 'OPTIONS' });
    const res = await onRequestOptions({ request: req, env: {} });
    expect(res.status).toBe(204);
    expect(res.headers.get('vary')).toBe('Origin');
  });
});
