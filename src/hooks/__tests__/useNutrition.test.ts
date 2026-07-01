import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { FdcNutrientPanel, RecipeIngredient } from '@/db/schema';

// The rerank worker is mocked away: it resolves `null` so enrichment falls back to
// the FDC top hit (the model-unavailable path), keeping the suite worker-free.
vi.mock('@/services/fdcMatcher', () => ({
  rerankCandidates: vi.fn().mockResolvedValue(null),
}));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const ONION_PANEL: FdcNutrientPanel = {
  fdc_id: '169967',
  description: 'Onions, raw',
  per100g: {
    energyKcal: 40,
    protein: 1.1,
    fat: 0.1,
    carbs: 9.34,
    fiber: 1.7,
    sodium: 4,
    calcium: 23,
    iron: 0.21,
    potassium: 146,
    vitaminC: 7.4,
    vitaminD: 0,
  },
};

const SEARCH_BODY = {
  candidates: [{ fdcId: '169967', description: 'Onions, raw', dataType: 'Foundation' }],
};

/** A fetch mock that answers the search + detail ops from the URL. */
function mockNutritionFetch() {
  return vi.fn(async (url: string) => {
    if (url.includes('op=search')) {
      return new Response(JSON.stringify(SEARCH_BODY), { status: 200 });
    }
    if (url.includes('op=detail')) {
      return new Response(JSON.stringify(ONION_PANEL), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
}

async function seedRecipe(
  lines: Array<{ canonical_name: string; quantity: number; unit: string }>,
): Promise<{ recipeId: string; ingredients: RecipeIngredient[] }> {
  const { dbPromise } = await import('@/db/idbClient');
  const db = await dbPromise;
  const recipeId = crypto.randomUUID();
  await db.add('recipes', { id: recipeId, title: 'Test', servings: 2, created_at: Date.now() });
  const ingredients: RecipeIngredient[] = [];
  for (const line of lines) {
    const row: RecipeIngredient = {
      id: crypto.randomUUID(),
      recipe_id: recipeId,
      raw: `${line.quantity} ${line.unit} ${line.canonical_name}`,
      canonical_name: line.canonical_name,
      quantity: line.quantity,
      unit: line.unit,
    };
    await db.add('recipe_ingredients', row);
    ingredients.push(row);
  }
  return { recipeId, ingredients };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('useEnrichRecipe', () => {
  it('matches an ingredient: fetches, caches, and persists fdc_id + grams', async () => {
    globalThis.fetch = mockNutritionFetch() as unknown as typeof fetch;
    const { recipeId, ingredients } = await seedRecipe([
      { canonical_name: 'onion', quantity: 1, unit: 'cup' },
    ]);

    const { useEnrichRecipe } = await import('@/hooks/useNutrition');
    const { result } = renderHook(() => useEnrichRecipe(), { wrapper: makeWrapper() });

    let summary;
    await act(async () => {
      summary = await result.current.mutateAsync({ recipeId, ingredients });
    });
    expect(summary).toEqual({ enriched: 1, unmatched: [], offline: false });

    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    const cached = await db.get('nutrition_cache', '169967');
    expect(cached?.query).toBe('onion');
    expect(cached?.payload.per100g.energyKcal).toBe(40);

    const persisted = await db.get('recipe_ingredients', ingredients[0].id);
    expect(persisted?.fdc_id).toBe('169967');
    // 1 cup onion via density (default ~1.0) resolves grams.
    expect(persisted?.grams).toBeGreaterThan(0);
  });

  it('short-circuits the network on a cache-by-query hit', async () => {
    const fetchMock = mockNutritionFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { recipeId, ingredients } = await seedRecipe([
      { canonical_name: 'onion', quantity: 1, unit: 'cup' },
    ]);

    // Pre-seed the cache with an entry whose query matches the ingredient.
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.put('nutrition_cache', {
      fdc_id: '169967',
      payload: ONION_PANEL,
      query: 'onion',
      fetched_at: Date.now(),
    });

    const { useEnrichRecipe } = await import('@/hooks/useNutrition');
    const { result } = renderHook(() => useEnrichRecipe(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ recipeId, ingredients });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    const persisted = await db.get('recipe_ingredients', ingredients[0].id);
    expect(persisted?.fdc_id).toBe('169967');
  });

  it('reports offline and leaves the ingredient unmatched on a network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('network')) as unknown as typeof fetch;
    const { recipeId, ingredients } = await seedRecipe([
      { canonical_name: 'onion', quantity: 1, unit: 'cup' },
    ]);

    const { useEnrichRecipe } = await import('@/hooks/useNutrition');
    const { result } = renderHook(() => useEnrichRecipe(), { wrapper: makeWrapper() });
    let summary;
    await act(async () => {
      summary = await result.current.mutateAsync({ recipeId, ingredients });
    });
    expect(summary).toEqual({ enriched: 0, unmatched: [], offline: true });

    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    const persisted = await db.get('recipe_ingredients', ingredients[0].id);
    expect(persisted?.fdc_id).toBeUndefined();
  });
});

describe('useRecipeNutrition', () => {
  it('computes a rollup and per-row status from persisted data, offline', async () => {
    // No fetch — read path must be network-free.
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('should not be called')) as unknown as typeof fetch;
    const { recipeId, ingredients } = await seedRecipe([
      { canonical_name: 'onion', quantity: 100, unit: 'g' },
      { canonical_name: 'mystery spice', quantity: 1, unit: 'sprig' },
    ]);

    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    // Enrich the first ingredient by hand (matched + grams), leave the second.
    await db.put('nutrition_cache', {
      fdc_id: '169967',
      payload: ONION_PANEL,
      query: 'onion',
      fetched_at: Date.now(),
    });
    await db.put('recipe_ingredients', { ...ingredients[0], fdc_id: '169967', grams: 100 });

    const { useRecipeNutrition } = await import('@/hooks/useNutrition');
    const { result } = renderHook(() => useRecipeNutrition(recipeId), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.rows).toHaveLength(2);
    // Rows come back in primary-key order, so look them up by name.
    const onionRow = data.rows.find((r) => r.name === 'Onion')!;
    const spiceRow = data.rows.find((r) => r.name === 'Mystery spice')!;
    expect(onionRow.status).toBe('enriched');
    expect(spiceRow.status).toBe('unmatched');
    // 100 g onion → its per-100 g panel verbatim; per serving = ÷2.
    expect(data.rollup.whole.energyKcal).toBeCloseTo(40, 5);
    expect(data.rollup.perServing.energyKcal).toBeCloseTo(20, 5);
    expect(data.rollup.enrichedCount).toBe(1);
    expect(data.rollup.unresolved).toEqual(['Mystery spice']);
  });
});

describe('remembered weights (portion overrides)', () => {
  it('auto-sizes a previously-unresolvable unit from a remembered weight, tagged override', async () => {
    globalThis.fetch = mockNutritionFetch() as unknown as typeof fetch;
    // "knob" is not a known unit, and ONION_PANEL carries no portions, so without a
    // remembered weight this row would stay unresolved (no grams).
    const { recipeId, ingredients } = await seedRecipe([
      { canonical_name: 'onion', quantity: 2, unit: 'knob' },
    ]);

    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    const { writePortionOverride } = await import('@/hooks/usePortionOverrides');
    await writePortionOverride(db, { canonical_name: 'onion', unit: 'knob', grams: 55, quantity: 1 });

    const { useEnrichRecipe } = await import('@/hooks/useNutrition');
    const { result } = renderHook(() => useEnrichRecipe(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ recipeId, ingredients });
    });

    const persisted = await db.get('recipe_ingredients', ingredients[0].id);
    expect(persisted?.fdc_id).toBe('169967');
    expect(persisted?.grams).toBe(110); // 55 g per knob × 2
    expect(persisted?.grams_source).toBe('override');
  });

  it('persists an override when the user manually sets a weight', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('no network')) as unknown as typeof fetch;
    const { recipeId, ingredients } = await seedRecipe([
      { canonical_name: 'onion', quantity: 2, unit: 'knob' },
    ]);

    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    // Pretend it was matched but couldn't be sized.
    await db.put('recipe_ingredients', { ...ingredients[0], fdc_id: '169967' });

    const { useSetIngredientGrams } = await import('@/hooks/useNutrition');
    const { result } = renderHook(() => useSetIngredientGrams(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ recipeId, ingredientId: ingredients[0].id, grams: 120 });
    });

    const persisted = await db.get('recipe_ingredients', ingredients[0].id);
    expect(persisted?.grams).toBe(120);
    expect(persisted?.grams_source).toBe('override');

    const { readPortionOverrides } = await import('@/hooks/usePortionOverrides');
    expect(await readPortionOverrides(db)).toEqual({ 'onion|knob': 60 }); // 120 g ÷ 2
  });

  it('reports gramsSource on each row from the persisted value', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('read path is offline')) as unknown as typeof fetch;
    const { recipeId, ingredients } = await seedRecipe([
      { canonical_name: 'onion', quantity: 1, unit: 'bunch' },
    ]);

    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.put('nutrition_cache', {
      fdc_id: '169967',
      payload: ONION_PANEL,
      query: 'onion',
      fetched_at: Date.now(),
    });
    await db.put('recipe_ingredients', {
      ...ingredients[0],
      fdc_id: '169967',
      grams: 150,
      grams_source: 'estimate',
    });

    const { useRecipeNutrition } = await import('@/hooks/useNutrition');
    const { result } = renderHook(() => useRecipeNutrition(recipeId), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const row = result.current.data!.rows[0];
    expect(row.status).toBe('enriched');
    expect(row.gramsSource).toBe('estimate');
  });
});

describe('usePickFood', () => {
  it('persists a manually picked food from the cache without a fetch', async () => {
    const fetchMock = mockNutritionFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { recipeId, ingredients } = await seedRecipe([
      { canonical_name: 'onion', quantity: 1, unit: 'cup' },
    ]);

    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.put('nutrition_cache', {
      fdc_id: '169967',
      payload: ONION_PANEL,
      query: 'onion',
      fetched_at: Date.now(),
    });

    const { usePickFood } = await import('@/hooks/useNutrition');
    const { result } = renderHook(() => usePickFood(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ recipeId, ingredient: ingredients[0], fdcId: '169967' });
    });

    expect(fetchMock).not.toHaveBeenCalled();
    const persisted = await db.get('recipe_ingredients', ingredients[0].id);
    expect(persisted?.fdc_id).toBe('169967');
  });
});
