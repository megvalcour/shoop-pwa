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
});
