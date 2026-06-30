import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { SaveRecipeInput } from '@/hooks/useRecipes';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const SAMPLE: SaveRecipeInput = {
  title: '  Weeknight Chili  ',
  source_url: 'https://example.com/chili',
  servings: 6,
  ingredients: [
    { raw: '2 cups black beans', name: 'Black beans', quantity: 2, unit: 'cups' },
    { raw: '1 lb ground beef', name: 'Ground beef', quantity: 1, unit: 'lb' },
  ],
};

describe('useSaveRecipe + useRecipes', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('creates a recipe and its ingredients in one round-trip', async () => {
    const { useSaveRecipe, useRecipe } = await import('@/hooks/useRecipes');
    const wrapper = makeWrapper();

    const { result: save } = renderHook(() => useSaveRecipe(), { wrapper });
    let id = '';
    await act(async () => {
      const recipe = await save.current.mutateAsync(SAMPLE);
      id = recipe.id;
    });

    const { result: detail } = renderHook(() => useRecipe(id), { wrapper });
    await waitFor(() => expect(detail.current.isSuccess).toBe(true));

    const data = detail.current.data!;
    expect(data.recipe.title).toBe('Weeknight Chili'); // trimmed
    expect(data.recipe.servings).toBe(6);
    expect(data.recipe.source_url).toBe('https://example.com/chili');
    expect(typeof data.recipe.created_at).toBe('number');
    expect(data.ingredients).toHaveLength(2);
    // Names are stored lower-cased as canonical_name (ADR-0026).
    expect(data.ingredients.map((i) => i.canonical_name).sort()).toEqual([
      'black beans',
      'ground beef',
    ]);
    expect(data.ingredients.every((i) => i.recipe_id === id)).toBe(true);
  });

  it('lists recipes newest-first with ingredient counts', async () => {
    const { useSaveRecipe, useRecipes } = await import('@/hooks/useRecipes');
    const wrapper = makeWrapper();
    const { result: save } = renderHook(() => useSaveRecipe(), { wrapper });

    // Stamp strictly-increasing created_at values. Two saves can otherwise land
    // in the same millisecond, tying `b.created_at - a.created_at` to 0; the
    // stable sort then falls back to insertion order and the assertion below
    // flakes (notably under the slower coverage run). A monotonic clock keeps
    // the ordering deterministic regardless of how often Date.now is called.
    let clock = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => ++clock);

    try {
      await act(async () => {
        await save.current.mutateAsync({ ...SAMPLE, title: 'First' });
      });
      await act(async () => {
        await save.current.mutateAsync({
          ...SAMPLE,
          title: 'Second',
          ingredients: [{ raw: 'Salt', name: 'Salt', quantity: 1, unit: '' }],
        });
      });
    } finally {
      nowSpy.mockRestore();
    }

    const { result: list } = renderHook(() => useRecipes(), { wrapper });
    await waitFor(() => expect(list.current.data?.length).toBe(2));
    // created_at desc → the second insert sorts first.
    expect(list.current.data!.map((r) => r.title)).toEqual(['Second', 'First']);
    expect(list.current.data!.map((r) => r.ingredientCount)).toEqual([1, 2]);
  });
});

describe('useUpdateRecipe', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('replaces the ingredient set without leaving orphans and preserves created_at', async () => {
    const { useSaveRecipe, useUpdateRecipe } = await import('@/hooks/useRecipes');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const { result: save } = renderHook(() => useSaveRecipe(), { wrapper });
    let id = '';
    let createdAt = 0;
    await act(async () => {
      const recipe = await save.current.mutateAsync(SAMPLE);
      id = recipe.id;
      createdAt = recipe.created_at;
    });

    const { result: update } = renderHook(() => useUpdateRecipe(), { wrapper });
    await act(async () => {
      await update.current.mutateAsync({
        id,
        title: 'Updated Chili',
        servings: 8,
        ingredients: [{ raw: '3 cloves garlic', name: 'Garlic', quantity: 3, unit: 'cloves' }],
      });
    });

    const db = await dbPromise;
    const recipe = await db.get('recipes', id);
    expect(recipe?.title).toBe('Updated Chili');
    expect(recipe?.servings).toBe(8);
    expect(recipe?.created_at).toBe(createdAt); // preserved
    // Exactly the new ingredient remains; the two original rows are gone.
    const rows = await db.getAllFromIndex('recipe_ingredients', 'recipe_id', id);
    expect(rows).toHaveLength(1);
    expect(rows[0].canonical_name).toBe('garlic');
    // No orphan rows anywhere in the store either.
    expect(await db.getAll('recipe_ingredients')).toHaveLength(1);
  });
});

describe('useDeleteRecipe', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('cascades the delete to the recipe ingredients, leaving no orphans', async () => {
    const { useSaveRecipe, useDeleteRecipe } = await import('@/hooks/useRecipes');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const { result: save } = renderHook(() => useSaveRecipe(), { wrapper });
    let keepId = '';
    let dropId = '';
    await act(async () => {
      keepId = (await save.current.mutateAsync({ ...SAMPLE, title: 'Keep' })).id;
      dropId = (await save.current.mutateAsync({ ...SAMPLE, title: 'Drop' })).id;
    });

    const { result: del } = renderHook(() => useDeleteRecipe(), { wrapper });
    await act(async () => {
      await del.current.mutateAsync(dropId);
    });

    const db = await dbPromise;
    expect(await db.get('recipes', dropId)).toBeUndefined();
    expect(await db.getAllFromIndex('recipe_ingredients', 'recipe_id', dropId)).toHaveLength(0);
    // The other recipe and its ingredients are untouched.
    expect(await db.get('recipes', keepId)).toBeTruthy();
    expect(await db.getAllFromIndex('recipe_ingredients', 'recipe_id', keepId)).toHaveLength(2);
  });
});
