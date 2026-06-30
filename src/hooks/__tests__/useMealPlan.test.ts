import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { Recipe } from '@/db/schema';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

async function seedRecipe(title: string): Promise<string> {
  const { dbPromise } = await import('@/db/idbClient');
  const db = await dbPromise;
  const recipe: Recipe = { id: crypto.randomUUID(), title, servings: 2, created_at: Date.now() };
  await db.add('recipes', recipe);
  return recipe.id;
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  vi.resetModules();
});

describe('useMealPlan CRUD', () => {
  it('adds an entry to a day, reads it grouped, updates servings, and removes it', async () => {
    const recipeId = await seedRecipe('Chili');
    const { useAddToPlan, useUpdatePlanServings, useRemoveFromPlan, useMealPlan } = await import(
      '@/hooks/useMealPlan'
    );
    const wrapper = makeWrapper();

    const { result: add } = renderHook(() => useAddToPlan(), { wrapper });
    let entryId = '';
    await act(async () => {
      const entry = await add.current.mutateAsync({ recipeId, day: 'mon', plannedServings: 3 });
      entryId = entry.id;
    });

    const { result: plan } = renderHook(() => useMealPlan(), { wrapper });
    await waitFor(() => expect(plan.current.isSuccess).toBe(true));
    expect(plan.current.data!.entryCount).toBe(1);
    expect(plan.current.data!.byDay.mon).toHaveLength(1);
    expect(plan.current.data!.byDay.mon[0].recipe.title).toBe('Chili');
    expect(plan.current.data!.byDay.mon[0].entry.planned_servings).toBe(3);
    expect(plan.current.data!.byDay.tue).toHaveLength(0);

    const { result: update } = renderHook(() => useUpdatePlanServings(), { wrapper });
    await act(async () => {
      await update.current.mutateAsync({ entryId, plannedServings: 5 });
    });
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    expect((await db.get('meal_plan_entries', entryId))?.planned_servings).toBe(5);

    const { result: remove } = renderHook(() => useRemoveFromPlan(), { wrapper });
    await act(async () => {
      await remove.current.mutateAsync(entryId);
    });
    expect(await db.get('meal_plan_entries', entryId)).toBeUndefined();
  });

  it('clamps planned servings to at least 1', async () => {
    const recipeId = await seedRecipe('Soup');
    const { useAddToPlan } = await import('@/hooks/useMealPlan');
    const { result: add } = renderHook(() => useAddToPlan(), { wrapper: makeWrapper() });
    let entryId = '';
    await act(async () => {
      entryId = (await add.current.mutateAsync({ recipeId, day: 'wed', plannedServings: 0 })).id;
    });
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    expect((await db.get('meal_plan_entries', entryId))?.planned_servings).toBe(1);
  });

  it('skips entries whose recipe was deleted (orphan-tolerant read)', async () => {
    const recipeId = await seedRecipe('Ghost');
    const { useAddToPlan, useMealPlan } = await import('@/hooks/useMealPlan');
    const wrapper = makeWrapper();
    const { result: add } = renderHook(() => useAddToPlan(), { wrapper });
    await act(async () => {
      await add.current.mutateAsync({ recipeId, day: 'thu', plannedServings: 1 });
    });
    // Delete the recipe directly (simulating a stale entry left behind).
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.delete('recipes', recipeId);

    const { result: plan } = renderHook(() => useMealPlan(), { wrapper });
    await waitFor(() => expect(plan.current.isSuccess).toBe(true));
    expect(plan.current.data!.entryCount).toBe(0);
    expect(plan.current.data!.byDay.thu).toHaveLength(0);
  });
});

describe('useDeleteRecipe cascade to meal_plan_entries', () => {
  it('deletes a recipe and all of its plan entries in one transaction', async () => {
    const dropId = await seedRecipe('Drop');
    const keepId = await seedRecipe('Keep');
    const { useAddToPlan } = await import('@/hooks/useMealPlan');
    const { useDeleteRecipe } = await import('@/hooks/useRecipes');
    const wrapper = makeWrapper();

    const { result: add } = renderHook(() => useAddToPlan(), { wrapper });
    await act(async () => {
      await add.current.mutateAsync({ recipeId: dropId, day: 'mon', plannedServings: 1 });
      await add.current.mutateAsync({ recipeId: dropId, day: 'fri', plannedServings: 2 });
      await add.current.mutateAsync({ recipeId: keepId, day: 'mon', plannedServings: 1 });
    });

    const { result: del } = renderHook(() => useDeleteRecipe(), { wrapper });
    await act(async () => {
      await del.current.mutateAsync(dropId);
    });

    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    expect(await db.getAllFromIndex('meal_plan_entries', 'recipe_id', dropId)).toHaveLength(0);
    // The other recipe's entry is untouched.
    expect(await db.getAllFromIndex('meal_plan_entries', 'recipe_id', keepId)).toHaveLength(1);
  });
});
