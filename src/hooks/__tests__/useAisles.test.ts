import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import type { Aisle } from '@/db/schema';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const STORE_ID = 'rt-store';

function seedAisles(): Aisle[] {
  return [
    { id: 'r-a', store_id: STORE_ID, number: '1', label: 'Dairy', sort_order: 0 },
    { id: 'r-b', store_id: STORE_ID, number: '2', label: 'Produce', sort_order: 1 },
    { id: 'r-c', store_id: STORE_ID, number: '3', label: 'Bakery', sort_order: 2 },
  ];
}

describe('useReorderAisles', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('rewrites sort_order to match the new id order and persists it', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    for (const a of seedAisles()) await db.put('aisles', a);

    vi.resetModules();
    const { useAisles, useReorderAisles } = await import('@/hooks/useAisles');
    const wrapper = makeWrapper();

    const { result: listResult } = renderHook(() => useAisles(STORE_ID), { wrapper });
    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));
    expect(listResult.current.data?.map((a) => a.id)).toEqual(['r-a', 'r-b', 'r-c']);

    const { result: reorder } = renderHook(() => useReorderAisles(), { wrapper });
    // Move Bakery to the front.
    await act(() =>
      reorder.current.mutateAsync({ storeId: STORE_ID, orderedIds: ['r-c', 'r-a', 'r-b'] }),
    );

    // Persisted sort_order reflects the new ordinal positions.
    expect((await db.get('aisles', 'r-c'))?.sort_order).toBe(0);
    expect((await db.get('aisles', 'r-a'))?.sort_order).toBe(1);
    expect((await db.get('aisles', 'r-b'))?.sort_order).toBe(2);

    // The read hook returns them in the new order.
    await waitFor(() =>
      expect(listResult.current.data?.map((a) => a.id)).toEqual(['r-c', 'r-a', 'r-b']),
    );
  });

  it('rolls back the optimistic order when the write fails', async () => {
    // Seed via a throwaway graph.
    {
      const { dbPromise } = await import('@/db/idbClient');
      const seedDb = await dbPromise;
      for (const a of seedAisles()) await seedDb.put('aisles', a);
    }

    vi.resetModules();
    const { dbPromise } = await import('@/db/idbClient');
    const { useAisles, useReorderAisles } = await import('@/hooks/useAisles');
    // Same db instance the freshly-imported hook uses.
    const db = await dbPromise;
    const wrapper = makeWrapper();

    const { result: listResult } = renderHook(() => useAisles(STORE_ID), { wrapper });
    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));

    // Force only the readwrite (write-phase) transaction to throw mid-mutation.
    const realTransaction = db.transaction.bind(db) as (...args: unknown[]) => unknown;
    const txHolder = db as unknown as { transaction: (...args: unknown[]) => unknown };
    const tx = vi.spyOn(txHolder, 'transaction').mockImplementation((...args: unknown[]) => {
      if (args[1] === 'readwrite') throw new Error('boom');
      return realTransaction(...args);
    });

    const { result: reorder } = renderHook(() => useReorderAisles(), { wrapper });
    await act(async () => {
      await reorder.current
        .mutateAsync({ storeId: STORE_ID, orderedIds: ['r-c', 'r-a', 'r-b'] })
        .catch(() => undefined);
    });

    tx.mockRestore();

    // Optimistic update was rolled back: original order restored.
    await waitFor(() =>
      expect(listResult.current.data?.map((a) => a.id)).toEqual(['r-a', 'r-b', 'r-c']),
    );
    // And nothing was actually persisted.
    expect((await db.get('aisles', 'r-a'))?.sort_order).toBe(0);
  });
});
