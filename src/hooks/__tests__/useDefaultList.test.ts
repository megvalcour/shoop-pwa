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

describe('useDefaultList', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('returns empty array when no entries exist', async () => {
    const { useDefaultList } = await import('@/hooks/useDefaultList');
    const { result } = renderHook(() => useDefaultList(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useAddDefaultListItem', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('creates a catalog item and a default_list entry for a novel name', async () => {
    const { useDefaultList, useAddDefaultListItem } = await import('@/hooks/useDefaultList');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const { result } = renderHook(
      () => ({ list: useDefaultList(), add: useAddDefaultListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() => result.current.add.mutateAsync('Olive Oil'));
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    const db = await dbPromise;
    const item = (await db.getAll('items')).find((i) => i.canonical_name === 'olive oil');
    expect(item).toBeDefined();
    const entry = result.current.list.data![0];
    expect(entry.item_id).toBe(item!.id);
    expect(entry.quantity).toBe(1);
  });

  it('reuses an existing catalog item (same item_id)', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('items', { id: 'it-milk', name: 'Milk', canonical_name: 'milk' });

    vi.resetModules();
    const { useDefaultList, useAddDefaultListItem } = await import('@/hooks/useDefaultList');
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => ({ list: useDefaultList(), add: useAddDefaultListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() => result.current.add.mutateAsync('milk'));
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    expect(result.current.list.data![0].item_id).toBe('it-milk');
    // No duplicate catalog row was created — still exactly one `milk`.
    const milks = (await db.getAll('items')).filter((i) => i.canonical_name === 'milk');
    expect(milks).toHaveLength(1);
  });

  it('is a no-op when the same item is added twice', async () => {
    const { useDefaultList, useAddDefaultListItem } = await import('@/hooks/useDefaultList');
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => ({ list: useDefaultList(), add: useAddDefaultListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() => result.current.add.mutateAsync('Bread'));
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    await act(() => result.current.add.mutateAsync('bread'));

    // Still one entry — dedupe by item_id.
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(result.current.list.data).toHaveLength(1);
  });
});

describe('useRemoveDefaultListItem', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('removes only the targeted entry and leaves the catalog item intact', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('items', { id: 'it-1', name: 'Apples', canonical_name: 'apples' });
    await db.add('default_list', { id: 'd-1', item_id: 'it-1', quantity: 1, unit: '', notes: '' });

    vi.resetModules();
    const { useDefaultList, useRemoveDefaultListItem } = await import('@/hooks/useDefaultList');
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => ({ list: useDefaultList(), remove: useRemoveDefaultListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    await act(() => result.current.remove.mutateAsync('d-1'));
    await waitFor(() => expect(result.current.list.data).toHaveLength(0));

    // The catalog item survives — removal is a template edit only.
    expect(await db.get('items', 'it-1')).toBeTruthy();
  });
});
