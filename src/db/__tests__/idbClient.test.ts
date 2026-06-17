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
      'stores',
      'weekly_list',
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
