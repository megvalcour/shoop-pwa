import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('idbClient', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory() as unknown as IDBFactory;
    vi.resetModules();
  });

  it('creates all object stores on migration', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    expect([...db.objectStoreNames].sort()).toEqual([
      'aisles',
      'default_list',
      'items',
      'list_items',
      'shopping_lists',
      'stores',
    ]);
  });

  it('seeds correct record counts', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    expect(await db.count('stores')).toBe(1);
    expect(await db.count('aisles')).toBe(31);
    expect(await db.count('items')).toBe(182);
    const [store] = await db.getAll('stores');
    expect(store.name).toBe('Oxford Market Basket #62');
  });

  it('is idempotent when the module is re-imported against an already-seeded DB', async () => {
    const { dbPromise: first } = await import('@/db/idbClient');
    await first;

    vi.resetModules();

    const { dbPromise: second } = await import('@/db/idbClient');
    const db = await second;
    expect(await db.count('stores')).toBe(1);
    expect(await db.count('aisles')).toBe(31);
    expect(await db.count('items')).toBe(182);
  });

  it('upgrades from v1 to v2: removes weekly_list, creates shopping_lists and list_items', async () => {
    const { openDB } = await import('idb');
    const v1 = await openDB('shoop', 1, {
      upgrade(db) {
        db.createObjectStore('stores', { keyPath: 'id' });
        const aisles = db.createObjectStore('aisles', { keyPath: 'id' });
        aisles.createIndex('store_id', 'store_id');
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('aisle_id', 'aisle_id');
        items.createIndex('store_id', 'store_id');
        db.createObjectStore('default_list', { keyPath: 'id' });
        (db as unknown as IDBDatabase).createObjectStore('weekly_list', { keyPath: 'id' });
      },
    });
    v1.close();

    vi.resetModules();
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;

    expect([...db.objectStoreNames].sort()).toEqual([
      'aisles',
      'default_list',
      'items',
      'list_items',
      'shopping_lists',
      'stores',
    ]);
  });

  it('returns correct index query results', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    const [store] = await db.getAll('stores');
    const aislesByStore = await db.getAllFromIndex('aisles', 'store_id', store.id);
    expect(aislesByStore).toHaveLength(31);
    const itemsByStore = await db.getAllFromIndex('items', 'store_id', store.id);
    expect(itemsByStore).toHaveLength(182);
  });

  describe('resetUserData', () => {
    it('clears all user data stores', async () => {
      const { dbPromise, resetUserData } = await import('@/db/idbClient');
      const db = await dbPromise;
      await db.add('shopping_lists', { id: 'sl-1', name: 'List', created_at: '2026-06-01T00:00:00.000Z' });
      await db.add('list_items', {
        id: 'li-1',
        list_id: 'sl-1',
        item_id: 'it-1',
        quantity: 1,
        checked: false,
        added_from_default: false,
        created_at: 1,
      });
      await db.add('default_list', { id: 'dl-1', item_id: 'it-1', quantity: 1, unit: '', notes: '' });

      await resetUserData();

      expect(await db.count('shopping_lists')).toBe(0);
      expect(await db.count('list_items')).toBe(0);
      expect(await db.count('default_list')).toBe(0);
    });

    it('drops user-added items but restores the seeded catalog', async () => {
      const { dbPromise, resetUserData } = await import('@/db/idbClient');
      const db = await dbPromise;
      const [store] = await db.getAll('stores');
      const userItemId = crypto.randomUUID();
      await db.add('items', {
        id: userItemId,
        name: 'Dragonfruit',
        canonical_name: 'dragonfruit',
        aisle_id: '',
        store_id: store.id,
      });
      expect(await db.count('items')).toBe(183);

      await resetUserData();

      expect(await db.count('items')).toBe(182);
      expect(await db.get('items', userItemId)).toBeUndefined();
    });

    it('reverts an aisle override on a seeded item', async () => {
      const { dbPromise, resetUserData } = await import('@/db/idbClient');
      const db = await dbPromise;
      const [seeded] = await db.getAll('items');
      const originalAisle = seeded.aisle_id;
      await db.put('items', { ...seeded, aisle_id: 'tampered-aisle' });
      expect((await db.get('items', seeded.id))?.aisle_id).toBe('tampered-aisle');

      await resetUserData();

      expect((await db.get('items', seeded.id))?.aisle_id).toBe(originalAisle);
    });

    it('preserves the seeded store and aisles', async () => {
      const { dbPromise, resetUserData } = await import('@/db/idbClient');
      const db = await dbPromise;

      await resetUserData();

      expect(await db.count('stores')).toBe(1);
      expect(await db.count('aisles')).toBe(31);
      const [store] = await db.getAll('stores');
      expect(store.name).toBe('Oxford Market Basket #62');
    });
  });
});
