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

describe('useRenameShoppingList', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('updates the name (trimmed) without touching id or created_at', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'ren-1', name: 'Old Name', created_at: '2026-06-01T00:00:00.000Z' });

    vi.resetModules();
    const { useShoppingLists, useRenameShoppingList } = await import('@/hooks/useShoppingLists');
    const wrapper = makeWrapper();

    const { result: listsResult } = renderHook(() => useShoppingLists(), { wrapper });
    await waitFor(() => expect(listsResult.current.data).toHaveLength(1));

    const { result: renameMutation } = renderHook(() => useRenameShoppingList(), { wrapper });
    await act(() => renameMutation.current.mutateAsync({ id: 'ren-1', name: '  New Name  ' }));

    const record = await db.get('shopping_lists', 'ren-1');
    expect(record?.name).toBe('New Name');
    expect(record?.id).toBe('ren-1');
    expect(record?.created_at).toBe('2026-06-01T00:00:00.000Z');
  });

  it('rejects when renaming a non-existent list', async () => {
    const { useRenameShoppingList } = await import('@/hooks/useShoppingLists');
    const { result } = renderHook(() => useRenameShoppingList(), { wrapper: makeWrapper() });
    await expect(
      act(() => result.current.mutateAsync({ id: 'missing', name: 'Whatever' })),
    ).rejects.toThrow(/not found/i);
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

  it('purges all list_items rows belonging to the deleted list', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'del-2', name: 'With Items', created_at: '2026-06-01T00:00:00.000Z' });
    await db.add('shopping_lists', { id: 'keep-1', name: 'Survivor', created_at: '2026-06-02T00:00:00.000Z' });
    await db.add('list_items', { id: 'li-1', list_id: 'del-2', item_id: 'it-1', quantity: 1, checked: false, added_from_default: false, created_at: 1 });
    await db.add('list_items', { id: 'li-2', list_id: 'del-2', item_id: 'it-2', quantity: 2, checked: false, added_from_default: false, created_at: 2 });
    await db.add('list_items', { id: 'li-3', list_id: 'keep-1', item_id: 'it-3', quantity: 1, checked: false, added_from_default: false, created_at: 3 });

    vi.resetModules();
    const { useDeleteShoppingList } = await import('@/hooks/useShoppingLists');
    const { result: deleteMutation } = renderHook(() => useDeleteShoppingList(), { wrapper: makeWrapper() });
    await act(() => deleteMutation.current.mutateAsync('del-2'));

    expect(await db.get('shopping_lists', 'del-2')).toBeUndefined();
    expect(await db.getAllFromIndex('list_items', 'list_id', 'del-2')).toHaveLength(0);
    // The other list and its items are untouched.
    expect(await db.get('shopping_lists', 'keep-1')).toBeTruthy();
    expect(await db.getAllFromIndex('list_items', 'list_id', 'keep-1')).toHaveLength(1);
  });

  it('never touches the global items store or its per-store locations', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('shopping_lists', { id: 'del-3', name: 'Override Test', created_at: '2026-06-01T00:00:00.000Z' });
    // A store-agnostic item with a manual per-store aisle override (ADR-0015),
    // referenced only by the deleted list.
    await db.add('items', { id: 'it-override', name: 'Tofu', canonical_name: 'tofu' });
    await db.add('item_locations', { id: 'loc-ov', item_id: 'it-override', store_id: 's1', aisle_id: 'dairy' });
    await db.add('list_items', { id: 'li-ov', list_id: 'del-3', item_id: 'it-override', quantity: 1, checked: false, added_from_default: false, created_at: 1 });

    vi.resetModules();
    const { useDeleteShoppingList } = await import('@/hooks/useShoppingLists');
    const { result: deleteMutation } = renderHook(() => useDeleteShoppingList(), { wrapper: makeWrapper() });
    await act(() => deleteMutation.current.mutateAsync('del-3'));

    const survivingItem = await db.get('items', 'it-override');
    expect(survivingItem).toBeTruthy();
    expect((await db.get('item_locations', 'loc-ov'))?.aisle_id).toBe('dairy');
  });
});
