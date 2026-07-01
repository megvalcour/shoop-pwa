import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
  vi.resetModules();
});

describe('readPortionOverrides', () => {
  it('returns an empty map when nothing has been written', async () => {
    const { readPortionOverrides } = await import('@/hooks/usePortionOverrides');
    expect(await readPortionOverrides()).toEqual({});
  });

  it('drops non-positive / non-numeric entries from a stored blob', async () => {
    const { dbPromise, PORTION_OVERRIDES_KEY } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.put('preferences', {
      key: PORTION_OVERRIDES_KEY,
      value: JSON.stringify({ 'cilantro|bunch': 23, 'bad|unit': 0, 'junk|unit': 'nope' }),
    });

    vi.resetModules();
    const { readPortionOverrides } = await import('@/hooks/usePortionOverrides');
    expect(await readPortionOverrides()).toEqual({ 'cilantro|bunch': 23 });
  });

  it('returns an empty map (never throws) on a corrupt blob', async () => {
    const { dbPromise, PORTION_OVERRIDES_KEY } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.put('preferences', { key: PORTION_OVERRIDES_KEY, value: '{not json' });

    vi.resetModules();
    const { readPortionOverrides } = await import('@/hooks/usePortionOverrides');
    expect(await readPortionOverrides()).toEqual({});
  });
});

describe('writePortionOverride', () => {
  it('stores a per-unit weight (grams / quantity) under a normalized key', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const { writePortionOverride, readPortionOverrides } = await import('@/hooks/usePortionOverrides');
    const db = await dbPromise;

    // 46 g resolved for 2 bunches → 23 g per bunch; case + plural collapse in the key.
    await writePortionOverride(db, {
      canonical_name: 'Cilantro',
      unit: 'Bunches',
      grams: 46,
      quantity: 2,
    });
    expect(await readPortionOverrides()).toEqual({ 'cilantro|bunch': 23 });
  });

  it('is a no-op for a non-positive quantity or grams', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const { writePortionOverride, readPortionOverrides } = await import('@/hooks/usePortionOverrides');
    const db = await dbPromise;

    await writePortionOverride(db, { canonical_name: 'x', unit: 'bunch', grams: 10, quantity: 0 });
    await writePortionOverride(db, { canonical_name: 'x', unit: 'bunch', grams: 0, quantity: 1 });
    expect(await readPortionOverrides()).toEqual({});
  });

  it('upserts without clobbering other keys', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const { writePortionOverride, readPortionOverrides } = await import('@/hooks/usePortionOverrides');
    const db = await dbPromise;

    await writePortionOverride(db, { canonical_name: 'cilantro', unit: 'bunch', grams: 23, quantity: 1 });
    await writePortionOverride(db, { canonical_name: 'garlic', unit: 'clove', grams: 3, quantity: 1 });
    await writePortionOverride(db, { canonical_name: 'cilantro', unit: 'bunch', grams: 30, quantity: 1 });

    expect(await readPortionOverrides()).toEqual({ 'cilantro|bunch': 30, 'garlic|clove': 3 });
  });
});

describe('usePortionOverrides / useRememberPortion', () => {
  it('reads empty, writes, and re-reads the remembered map through the hooks', async () => {
    const { usePortionOverrides, useRememberPortion } = await import('@/hooks/usePortionOverrides');
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => ({ read: usePortionOverrides(), remember: useRememberPortion() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.read.isSuccess).toBe(true));
    expect(result.current.read.data).toEqual({});

    await act(() =>
      result.current.remember.mutateAsync({
        canonical_name: 'cilantro',
        unit: 'bunch',
        grams: 23,
        quantity: 1,
      }),
    );

    await waitFor(() => expect(result.current.read.data).toEqual({ 'cilantro|bunch': 23 }));
  });
});
