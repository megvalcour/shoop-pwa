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

describe('useResetData', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('wipes user data and invalidates all caches on success', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'sl-1', name: 'List', created_at: '2026-06-01T00:00:00.000Z' });

    vi.resetModules();
    const { useResetData } = await import('@/hooks/useResetData');
    const { queryClient, wrapper } = makeContext();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useResetData(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(await db.count('shopping_lists')).toBe(0);
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
