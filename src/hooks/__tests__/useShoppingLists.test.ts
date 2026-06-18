import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useShoppingLists', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('returns empty array when no lists exist', async () => {
    const { useShoppingLists } = await import('@/hooks/useShoppingLists');
    const { result } = renderHook(() => useShoppingLists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('returns lists sorted descending by created_at', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'a', name: 'First', created_at: '2026-06-01T10:00:00.000Z' });
    await db.add('shopping_lists', { id: 'b', name: 'Second', created_at: '2026-06-15T10:00:00.000Z' });

    vi.resetModules();
    const { useShoppingLists } = await import('@/hooks/useShoppingLists');
    const { result } = renderHook(() => useShoppingLists(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((l) => l.id)).toEqual(['b', 'a']);
  });
});

describe('useCreateShoppingList', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('creates a list and invalidates the query', async () => {
    const { useShoppingLists, useCreateShoppingList } = await import('@/hooks/useShoppingLists');
    const wrapper = makeWrapper();

    const { result: listsResult } = renderHook(() => useShoppingLists(), { wrapper });
    await waitFor(() => expect(listsResult.current.isSuccess).toBe(true));
    expect(listsResult.current.data).toHaveLength(0);

    const { result: mutationResult } = renderHook(() => useCreateShoppingList(), { wrapper });

    await act(() => mutationResult.current.mutateAsync());

    await waitFor(() => expect(listsResult.current.data).toHaveLength(1));
    const created = listsResult.current.data![0];
    expect(created.name).toMatch(/\w+ \d+$/);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('includes store name in generated list name', async () => {
    const { useCreateShoppingList, useShoppingLists } = await import('@/hooks/useShoppingLists');
    const wrapper = makeWrapper();

    const { result: mutationResult } = renderHook(() => useCreateShoppingList(), { wrapper });
    await act(() => mutationResult.current.mutateAsync());

    const { result: listsResult } = renderHook(() => useShoppingLists(), { wrapper });
    await waitFor(() => expect(listsResult.current.isSuccess).toBe(true));

    expect(listsResult.current.data![0].name).toMatch(/Oxford Market Basket #62 - \w+ \d+/);
  });
});

describe('useDeleteShoppingList', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('removes the list and reflects in useShoppingLists', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'del-1', name: 'To Delete', created_at: '2026-06-01T00:00:00.000Z' });

    vi.resetModules();
    const { useShoppingLists, useDeleteShoppingList } = await import('@/hooks/useShoppingLists');
    const wrapper = makeWrapper();

    const { result: listsResult } = renderHook(() => useShoppingLists(), { wrapper });
    await waitFor(() => expect(listsResult.current.data).toHaveLength(1));

    const { result: deleteMutation } = renderHook(() => useDeleteShoppingList(), { wrapper });
    await act(() => deleteMutation.current.mutateAsync('del-1'));

    await waitFor(() => expect(listsResult.current.data).toHaveLength(0));
  });
});
