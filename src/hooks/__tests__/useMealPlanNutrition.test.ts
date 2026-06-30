import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { FdcNutrientPanel, MealPlanEntry, Recipe, RecipeIngredient } from '@/db/schema';
import type { NutritionTargets } from '@/services/nutritionTargets';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const PANEL: FdcNutrientPanel = {
  fdc_id: '1',
  description: 'Onions, raw',
  per100g: {
    energyKcal: 40,
    protein: 1,
    fat: 0,
    carbs: 9,
    fiber: 2,
    sodium: 4,
    calcium: 23,
    iron: 0.2,
    potassium: 146,
    vitaminC: 7,
    vitaminD: 0,
  },
};

const TARGETS: NutritionTargets = {
  energyKcal: 2000,
  protein: { grams: 100 },
  fat: { grams: 60 },
  carbs: { grams: 250 },
  micros: [{ key: 'fiber', label: 'Fiber', amount: 30, unit: 'g' }],
};

/** Seed a recipe + ingredients; `enrich` controls whether the cache+grams join resolves. */
async function seedRecipe(
  title: string,
  servings: number,
  ingredients: Array<{ name: string; grams?: number; enriched: boolean }>,
): Promise<string> {
  const { dbPromise } = await import('@/db/idbClient');
  const db = await dbPromise;
  const recipeId = crypto.randomUUID();
  const recipe: Recipe = { id: recipeId, title, servings, created_at: Date.now() };
  await db.add('recipes', recipe);
  await db.put('nutrition_cache', { fdc_id: '1', payload: PANEL, query: 'onion', fetched_at: 0 });
  for (const line of ingredients) {
    const row: RecipeIngredient = {
      id: crypto.randomUUID(),
      recipe_id: recipeId,
      raw: line.name,
      canonical_name: line.name,
      quantity: 1,
      unit: 'g',
      ...(line.enriched ? { fdc_id: '1', grams: line.grams ?? 100 } : {}),
    };
    await db.add('recipe_ingredients', row);
  }
  return recipeId;
}

async function place(recipeId: string, day: string, plannedServings: number): Promise<void> {
  const { dbPromise } = await import('@/db/idbClient');
  const db = await dbPromise;
  const entry: MealPlanEntry = {
    id: crypto.randomUUID(),
    recipe_id: recipeId,
    day,
    planned_servings: plannedServings,
  };
  await db.add('meal_plan_entries', entry);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  vi.resetModules();
});

describe('useMealPlanNutrition', () => {
  it('joins multiple recipes, scores per day, and averages the week', async () => {
    // Recipe: 100 g onion, servings 1 → perServing = the panel verbatim.
    const recipeId = await seedRecipe('Onion', 1, [{ name: 'onion', grams: 100, enriched: true }]);
    await place(recipeId, 'mon', 2); // 2 servings → energy 80
    await place(recipeId, 'wed', 1); // 1 serving → energy 40

    const { useMealPlanNutrition } = await import('@/hooks/useMealPlanNutrition');
    const { result } = renderHook(() => useMealPlanNutrition(TARGETS), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    expect(data.isEmpty).toBe(false);
    expect(data.hasTargets).toBe(true);
    expect(data.byDay.mon.totals.energyKcal).toBeCloseTo(80, 5);
    expect(data.byDay.wed.totals.energyKcal).toBeCloseTo(40, 5);
    expect(data.byDay.tue.totals.energyKcal).toBe(0);
    // Per-day scores exist when targets are present.
    expect(data.byDay.mon.scores).not.toBeNull();
    const monEnergy = data.byDay.mon.scores!.find((s) => s.key === 'energyKcal')!;
    expect(monEnergy.pct).toBeCloseTo(80 / 2000, 5);
    // Weekly average = (80 + 40) / 7.
    expect(data.weekly.totals.energyKcal).toBeCloseTo(120 / 7, 5);
  });

  it('an unenriched recipe contributes a partial total and is flagged', async () => {
    const recipeId = await seedRecipe('Mixed', 1, [
      { name: 'onion', grams: 100, enriched: true },
      { name: 'mystery', enriched: false },
    ]);
    await place(recipeId, 'mon', 1);

    const { useMealPlanNutrition } = await import('@/hooks/useMealPlanNutrition');
    const { result } = renderHook(() => useMealPlanNutrition(TARGETS), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const data = result.current.data!;
    // Only the matched ingredient contributes.
    expect(data.byDay.mon.totals.energyKcal).toBeCloseTo(40, 5);
    const enrichment = data.recipeEnrichment[recipeId];
    expect(enrichment.status).toBe('partial');
    expect(enrichment.enrichedCount).toBe(1);
    expect(enrichment.totalCount).toBe(2);
    expect(data.unenrichedRecipes.map((r) => r.recipeId)).toContain(recipeId);
  });

  it('skips an orphan entry whose recipe no longer exists', async () => {
    await place('does-not-exist', 'mon', 1);
    const { useMealPlanNutrition } = await import('@/hooks/useMealPlanNutrition');
    const { result } = renderHook(() => useMealPlanNutrition(TARGETS), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data!.isEmpty).toBe(true);
    expect(result.current.data!.byDay.mon.totals.energyKcal).toBe(0);
  });

  it('withholds scores when there are no targets (no profile)', async () => {
    const recipeId = await seedRecipe('Onion', 1, [{ name: 'onion', grams: 100, enriched: true }]);
    await place(recipeId, 'mon', 1);
    const { useMealPlanNutrition } = await import('@/hooks/useMealPlanNutrition');
    const { result } = renderHook(() => useMealPlanNutrition(null), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.hasTargets).toBe(false);
    expect(data.byDay.mon.scores).toBeNull();
    expect(data.weekly.scores).toBeNull();
    // Totals are still computed.
    expect(data.byDay.mon.totals.energyKcal).toBeCloseTo(40, 5);
  });
});
