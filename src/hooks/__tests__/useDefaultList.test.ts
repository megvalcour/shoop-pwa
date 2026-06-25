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

  it('increments the existing entry (no duplicate) when the same item is added twice', async () => {
    const { useDefaultList, useAddDefaultListItem } = await import('@/hooks/useDefaultList');
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => ({ list: useDefaultList(), add: useAddDefaultListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() => result.current.add.mutateAsync('Bread'));
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    let second: { incremented: boolean } | undefined;
    await act(async () => {
      second = await result.current.add.mutateAsync('bread');
    });

    // Still one entry — dedupe by item_id — but its quantity went up by one.
    await waitFor(() => expect(result.current.list.data?.[0].quantity).toBe(2));
    expect(result.current.list.data).toHaveLength(1);
    expect(second?.incremented).toBe(true);
  });

  it('preserves unit and notes when incrementing an existing entry', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    // A name guaranteed not to collide with the seeded catalog so resolveItem
    // maps deterministically to our entry's item.
    await db.add('items', { id: 'it-zorp', name: 'Zorpflour', canonical_name: 'zorpflour' });
    await db.add('default_list', {
      id: 'd-zorp',
      item_id: 'it-zorp',
      quantity: 2,
      unit: 'cups',
      notes: 'sifted',
    });

    vi.resetModules();
    const { useDefaultList, useAddDefaultListItem } = await import('@/hooks/useDefaultList');
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => ({ list: useDefaultList(), add: useAddDefaultListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    await act(() => result.current.add.mutateAsync('ZORPFLOUR'));

    const entry = await db.get('default_list', 'd-zorp');
    expect(entry).toMatchObject({ quantity: 3, unit: 'cups', notes: 'sifted' });
  });
});

describe('useUpdateDefaultListItem', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('persists quantity and unit while preserving notes', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('default_list', {
      id: 'd-1',
      item_id: 'it-1',
      quantity: 1,
      unit: '',
      notes: 'keep me',
    });

    vi.resetModules();
    const { useUpdateDefaultListItem } = await import('@/hooks/useDefaultList');
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useUpdateDefaultListItem(), { wrapper });

    await act(() => result.current.mutateAsync({ id: 'd-1', quantity: 4, unit: 'oz' }));

    const entry = await db.get('default_list', 'd-1');
    expect(entry).toMatchObject({ quantity: 4, unit: 'oz', notes: 'keep me' });
  });

  it('optimistically updates the query then rolls back on error', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    await db.add('default_list', { id: 'd-1', item_id: 'it-1', quantity: 1, unit: '', notes: '' });

    vi.resetModules();
    const { useDefaultList, useUpdateDefaultListItem } = await import('@/hooks/useDefaultList');
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => ({ list: useDefaultList(), update: useUpdateDefaultListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    await act(() =>
      result.current.update
        .mutateAsync({ id: 'missing', quantity: 9, unit: 'oz' })
        .catch(() => {}),
    );

    await waitFor(() => expect(result.current.list.data?.[0].quantity).toBe(1));
    expect(result.current.list.data?.[0].unit).toBe('');
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
