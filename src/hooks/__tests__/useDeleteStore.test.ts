import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

function makeContext() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { queryClient, wrapper };
}

describe('useDeleteStore', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('deletes the store and invalidates the store-keyed caches on success', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    const storeId = crypto.randomUUID();
    await db.add('stores', { id: storeId, name: 'My Store', address: '1 Way', slug: 'my-store' });
    await db.add('aisles', {
      id: crypto.randomUUID(),
      store_id: storeId,
      number: '1',
      label: 'Produce',
      sort_order: 0,
    });

    vi.resetModules();
    const { useDeleteStore } = await import('@/hooks/useDeleteStore');
    const { ACTIVE_STORE_QUERY_KEY } = await import('@/hooks/usePreferences');
    const { queryClient, wrapper } = makeContext();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteStore(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(storeId);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(await db.get('stores', storeId)).toBeUndefined();
    expect(await db.getAllFromIndex('aisles', 'store_id', storeId)).toHaveLength(0);

    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(['stores']);
    expect(invalidatedKeys).toContainEqual(['aisles']);
    expect(invalidatedKeys).toContainEqual(['item_locations']);
    expect(invalidatedKeys).toContainEqual(ACTIVE_STORE_QUERY_KEY);
  });

  it('surfaces an error and keeps a built-in store when delete is rejected', async () => {
    const { dbPromise, BUILTIN_STORE_IDS } = await import('@/db/idbClient');
    const db = await dbPromise;
    const builtInId = [...BUILTIN_STORE_IDS][0];

    vi.resetModules();
    const { useDeleteStore } = await import('@/hooks/useDeleteStore');
    const { wrapper } = makeContext();
    const { result } = renderHook(() => useDeleteStore(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(builtInId).catch(() => {});
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(await db.get('stores', builtInId)).toBeDefined();
  });
});
