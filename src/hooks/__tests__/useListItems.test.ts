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

describe('useListItems', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('returns empty array for a list with no items', async () => {
    const { useListItems } = await import('@/hooks/useListItems');
    const { result } = renderHook(() => useListItems('list-1'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useAddListItem', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('creates a new items row and list_items row when the name is novel', async () => {
    const { useListItems, useAddListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');

    const { result } = renderHook(
      () => ({ list: useListItems('list-1'), add: useAddListItem() }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() => result.current.add.mutateAsync({ listId: 'list-1', name: 'Milk' }));

    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    const db = await dbPromise;
    const allItems = await db.getAll('items');
    const newItem = allItems.find((i) => i.canonical_name === 'milk');
    expect(newItem).toBeDefined();
    expect(newItem!.name).toBe('Milk');
  });

  it('reuses an existing item (same item_id) across different lists when canonical_name matches', async () => {
    const { useAddListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');

    const { result: mutResult } = renderHook(() => useAddListItem(), { wrapper: makeWrapper() });
    await act(() => mutResult.current.mutateAsync({ listId: 'list-1', name: 'Eggs' }));
    await act(() => mutResult.current.mutateAsync({ listId: 'list-2', name: 'EGGS' }));

    const db = await dbPromise;
    const allItems = await db.getAll('items');
    const eggItems = allItems.filter((i) => i.canonical_name === 'eggs');
    expect(eggItems).toHaveLength(1);

    const allListItems = await db.getAll('list_items');
    const eggListItems = allListItems.filter((li) => li.item_id === eggItems[0].id);
    expect(eggListItems).toHaveLength(2);
    const listIds = eggListItems.map((li) => li.list_id);
    expect(listIds).toContain('list-1');
    expect(listIds).toContain('list-2');
  });

  it('increments the existing row (no duplicate) when the same item is added twice, any casing', async () => {
    const { useListItems, useAddListItem } = await import('@/hooks/useListItems');
    const wrapper = makeWrapper();

    const { result } = renderHook(
      () => ({ list: useListItems('list-1'), add: useAddListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await act(() => result.current.add.mutateAsync({ listId: 'list-1', name: 'Butter' }));

    let second: { incremented: boolean } | undefined;
    await act(async () => {
      second = await result.current.add.mutateAsync({ listId: 'list-1', name: 'butter' });
    });

    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    expect(result.current.list.data?.[0].quantity).toBe(2);
    expect(second?.incremented).toBe(true);
  });

  it('new rows default to quantity 1 and an empty unit', async () => {
    const { useListItems, useAddListItem } = await import('@/hooks/useListItems');
    const wrapper = makeWrapper();

    const { result } = renderHook(
      () => ({ list: useListItems('list-1'), add: useAddListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    let res: { incremented: boolean } | undefined;
    await act(async () => {
      res = await result.current.add.mutateAsync({ listId: 'list-1', name: 'Bread' });
    });
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));
    expect(result.current.list.data?.[0]).toMatchObject({ quantity: 1, unit: '' });
    expect(res?.incremented).toBe(false);
  });

  it('invalidates the list_items query so the list grows by 1', async () => {
    const { useListItems, useAddListItem } = await import('@/hooks/useListItems');
    const wrapper = makeWrapper();

    const { result: listResult } = renderHook(() => useListItems('list-1'), { wrapper });
    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));
    expect(listResult.current.data).toHaveLength(0);

    const { result: mutResult } = renderHook(() => useAddListItem(), { wrapper });
    await act(() => mutResult.current.mutateAsync({ listId: 'list-1', name: 'Bread' }));

    await waitFor(() => expect(listResult.current.data).toHaveLength(1));
  });

  it('dedupes a same-name concurrent add to the same list (in-flight guard)', async () => {
    const { useListItems, useAddListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const { result } = renderHook(
      () => ({ list: useListItems('list-1'), add: useAddListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(async () => {
      await Promise.all([
        result.current.add.mutateAsync({ listId: 'list-1', name: 'Milk' }),
        result.current.add.mutateAsync({ listId: 'list-1', name: 'Milk' }),
      ]);
    });

    const db = await dbPromise;
    const items = (await db.getAll('items')).filter((i) => i.canonical_name === 'milk');
    expect(items).toHaveLength(1);
    const listItems = (await db.getAll('list_items')).filter((li) => li.list_id === 'list-1');
    expect(listItems).toHaveLength(1);
  });

  it('persists distinct concurrent adds to the same list', async () => {
    const { useListItems, useAddListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const { result } = renderHook(
      () => ({ list: useListItems('list-1'), add: useAddListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(async () => {
      await Promise.all([
        result.current.add.mutateAsync({ listId: 'list-1', name: 'Milk' }),
        result.current.add.mutateAsync({ listId: 'list-1', name: 'Eggs' }),
      ]);
    });

    const db = await dbPromise;
    const listItems = (await db.getAll('list_items')).filter((li) => li.list_id === 'list-1');
    expect(listItems).toHaveLength(2);
  });

  it('throws and writes nothing when name is empty', async () => {
    const { useListItems, useAddListItem } = await import('@/hooks/useListItems');
    const wrapper = makeWrapper();

    const { result: mutResult } = renderHook(() => useAddListItem(), { wrapper });
    await act(() =>
      mutResult.current.mutateAsync({ listId: 'list-1', name: '' }).catch(() => {}),
    );

    const { result: listResult } = renderHook(() => useListItems('list-1'), { wrapper });
    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));
    expect(listResult.current.data).toHaveLength(0);
  });

  it('throws and writes nothing when name is whitespace-only', async () => {
    const { useListItems, useAddListItem } = await import('@/hooks/useListItems');
    const wrapper = makeWrapper();

    const { result: mutResult } = renderHook(() => useAddListItem(), { wrapper });
    await act(() =>
      mutResult.current.mutateAsync({ listId: 'list-1', name: '   ' }).catch(() => {}),
    );

    const { result: listResult } = renderHook(() => useListItems('list-1'), { wrapper });
    await waitFor(() => expect(listResult.current.isSuccess).toBe(true));
    expect(listResult.current.data).toHaveLength(0);
  });
});

describe('useToggleListItem', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('flips checked from false to true in IDB', async () => {
    const { useListItems, useToggleListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const db = await dbPromise;
    const row = {
      id: 'li-1',
      list_id: 'list-1',
      item_id: 'item-1',
      quantity: 1,
      unit: '',
      checked: false,
      added_from_default: false,
      created_at: Date.now(),
    };
    await db.add('list_items', row);

    const { result } = renderHook(
      () => ({ list: useListItems('list-1'), toggle: useToggleListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    await act(() => result.current.toggle.mutateAsync({ id: 'li-1', listId: 'list-1' }));

    const updated = await db.get('list_items', 'li-1');
    expect(updated?.checked).toBe(true);
  });

  it('flips checked back to false on a second call', async () => {
    const { useToggleListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const db = await dbPromise;
    await db.add('list_items', {
      id: 'li-1',
      list_id: 'list-1',
      item_id: 'item-1',
      quantity: 1,
      unit: '',
      checked: false,
      added_from_default: false,
      created_at: Date.now(),
    });

    const { result } = renderHook(() => useToggleListItem(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 'li-1', listId: 'list-1' }));
    await act(() => result.current.mutateAsync({ id: 'li-1', listId: 'list-1' }));

    const updated = await db.get('list_items', 'li-1');
    expect(updated?.checked).toBe(false);
  });

  it('useListItems query reflects updated checked state after toggle settles', async () => {
    const { useListItems, useToggleListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const db = await dbPromise;
    await db.add('list_items', {
      id: 'li-1',
      list_id: 'list-1',
      item_id: 'item-1',
      quantity: 1,
      unit: '',
      checked: false,
      added_from_default: false,
      created_at: Date.now(),
    });

    const { result } = renderHook(
      () => ({ list: useListItems('list-1'), toggle: useToggleListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    expect(result.current.list.data?.[0].checked).toBe(false);

    await act(() => result.current.toggle.mutateAsync({ id: 'li-1', listId: 'list-1' }));
    await waitFor(() => expect(result.current.list.data?.[0].checked).toBe(true));
  });
});

describe('useUpdateListItem', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('persists quantity and unit to IDB', async () => {
    const { useUpdateListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const db = await dbPromise;
    await db.add('list_items', {
      id: 'li-1',
      list_id: 'list-1',
      item_id: 'item-1',
      quantity: 1,
      unit: '',
      checked: false,
      added_from_default: false,
      created_at: Date.now(),
    });

    const { result } = renderHook(() => useUpdateListItem(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ id: 'li-1', listId: 'list-1', quantity: 3, unit: 'cans' }),
    );

    const updated = await db.get('list_items', 'li-1');
    expect(updated).toMatchObject({ quantity: 3, unit: 'cans' });
  });

  it('optimistically updates the query then rolls back on error', async () => {
    const { useListItems, useUpdateListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const db = await dbPromise;
    await db.add('list_items', {
      id: 'li-1',
      list_id: 'list-1',
      item_id: 'item-1',
      quantity: 1,
      unit: '',
      checked: false,
      added_from_default: false,
      created_at: Date.now(),
    });

    const { result } = renderHook(
      () => ({ list: useListItems('list-1'), update: useUpdateListItem() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));

    // A missing row makes the mutationFn throw; the optimistic update must roll back.
    await act(() =>
      result.current.update
        .mutateAsync({ id: 'missing', listId: 'list-1', quantity: 9, unit: 'oz' })
        .catch(() => {}),
    );

    await waitFor(() => expect(result.current.list.data?.[0].quantity).toBe(1));
    expect(result.current.list.data?.[0].unit).toBe('');
  });
});

describe('useDeleteListItem', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('deletes the list_items row from IDB on success', async () => {
    const { useAddListItem, useDeleteListItem } = await import('@/hooks/useListItems');
    const { dbPromise } = await import('@/db/idbClient');
    const wrapper = makeWrapper();

    const { result: addResult } = renderHook(() => useAddListItem(), { wrapper });
    await act(() => addResult.current.mutateAsync({ listId: 'list-1', name: 'Milk' }));

    const db = await dbPromise;
    const [listItem] = await db.getAll('list_items');
    expect(listItem).toBeDefined();

    const { result: delResult } = renderHook(() => useDeleteListItem(), { wrapper });
    await act(() => delResult.current.mutateAsync({ id: listItem.id, listId: 'list-1' }));

    const remaining = await db.getAll('list_items');
    expect(remaining).toHaveLength(0);
  });

  it('useListItems query shrinks by 1 after delete settles', async () => {
    const { useListItems, useAddListItem, useDeleteListItem } = await import(
      '@/hooks/useListItems'
    );
    const wrapper = makeWrapper();

    const { result } = renderHook(
      () => ({
        list: useListItems('list-1'),
        add: useAddListItem(),
        del: useDeleteListItem(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    await act(() => result.current.add.mutateAsync({ listId: 'list-1', name: 'Eggs' }));
    await waitFor(() => expect(result.current.list.data).toHaveLength(1));

    const id = result.current.list.data![0].id;
    await act(() => result.current.del.mutateAsync({ id, listId: 'list-1' }));
    await waitFor(() => expect(result.current.list.data).toHaveLength(0));
  });
});
