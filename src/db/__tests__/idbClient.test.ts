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
      'item_locations',
      'items',
      'list_items',
      'preferences',
      'shopping_lists',
      'stores',
    ]);
  });

  it('seeds both stores, the shared catalog, and per-store locations', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    expect(await db.count('stores')).toBe(2);
    // 31 oxford aisles + 26 big-y aisles.
    expect(await db.count('aisles')).toBe(57);
    // The catalog is shared and store-agnostic.
    expect(await db.count('items')).toBe(182);
    // Per-store placements: 182 oxford + 182 big-y.
    expect(await db.count('item_locations')).toBe(364);
    const names = (await db.getAll('stores')).map((s) => s.name).sort();
    expect(names).toEqual(['Big Y World Class Market', 'Oxford Market Basket #62']);
  });

  it('seeds the default active store preference', async () => {
    const { dbPromise, ACTIVE_STORE_ID_KEY } = await import('@/db/idbClient');
    const db = await dbPromise;
    const pref = await db.get('preferences', ACTIVE_STORE_ID_KEY);
    const oxford = (await db.getAll('stores')).find((s) => s.slug === 'oxford-62');
    expect(pref?.value).toBe(oxford!.id);
  });

  it('stores items without per-store fields (store-agnostic catalog)', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    const [item] = await db.getAll('items');
    expect(item).toHaveProperty('canonical_name');
    expect(item).not.toHaveProperty('aisle_id');
    expect(item).not.toHaveProperty('store_id');
  });

  it('is idempotent when the module is re-imported against an already-seeded DB', async () => {
    const { dbPromise: first } = await import('@/db/idbClient');
    await first;

    vi.resetModules();

    const { dbPromise: second } = await import('@/db/idbClient');
    const db = await second;
    expect(await db.count('stores')).toBe(2);
    expect(await db.count('items')).toBe(182);
    expect(await db.count('item_locations')).toBe(364);
  });

  it('upgrades from v1 to v4: creates the new stores and migrates as expected', async () => {
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
      'item_locations',
      'items',
      'list_items',
      'preferences',
      'shopping_lists',
      'stores',
    ]);
  });

  it('upgrades a populated v2 DB: moves each item store_id/aisle_id into an item_location', async () => {
    const { openDB } = await import('idb');
    const v2 = await openDB('shoop', 2, {
      upgrade(db) {
        db.createObjectStore('stores', { keyPath: 'id' });
        const aisles = db.createObjectStore('aisles', { keyPath: 'id' });
        aisles.createIndex('store_id', 'store_id');
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('aisle_id', 'aisle_id');
        items.createIndex('store_id', 'store_id');
        db.createObjectStore('default_list', { keyPath: 'id' });
        db.createObjectStore('shopping_lists', { keyPath: 'id' });
        const li = db.createObjectStore('list_items', { keyPath: 'id' });
        li.createIndex('list_id', 'list_id');
      },
    });
    // A located item and an uncategorized one (empty aisle_id → no location).
    await v2.add('stores', { id: 'st-1', name: 'Old Store', address: '', slug: 'old' });
    await v2.add('items', {
      id: 'it-1',
      name: 'Milk',
      canonical_name: 'milk',
      aisle_id: 'ai-1',
      store_id: 'st-1',
    });
    await v2.add('items', {
      id: 'it-2',
      name: 'Mystery',
      canonical_name: 'mystery',
      aisle_id: '',
      store_id: 'st-1',
    });
    v2.close();

    vi.resetModules();
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;

    // Items are rewritten store-agnostic.
    const it1 = await db.get('items', 'it-1');
    expect(it1).toEqual({ id: 'it-1', name: 'Milk', canonical_name: 'milk' });

    // The located item gains an item_location; the uncategorized one does not.
    const locs = await db.getAllFromIndex('item_locations', 'item_id', 'it-1');
    expect(locs).toHaveLength(1);
    expect(locs[0]).toMatchObject({ item_id: 'it-1', store_id: 'st-1', aisle_id: 'ai-1' });
    expect(await db.getAllFromIndex('item_locations', 'item_id', 'it-2')).toHaveLength(0);
  });

  it('grafts Big Y into a populated v3 DB that was seeded before it existed', async () => {
    const { openDB } = await import('idb');
    // Simulate the buggy v3 state: an existing install that upgraded to v3
    // before Big Y was added, so seedDatabase() early-returned and only the
    // Market Basket store was ever seeded.
    const v3 = await openDB('shoop', 3, {
      upgrade(db) {
        db.createObjectStore('stores', { keyPath: 'id' });
        const aisles = db.createObjectStore('aisles', { keyPath: 'id' });
        aisles.createIndex('store_id', 'store_id');
        db.createObjectStore('items', { keyPath: 'id' });
        const il = db.createObjectStore('item_locations', { keyPath: 'id' });
        il.createIndex('item_id', 'item_id');
        il.createIndex('store_id', 'store_id');
        db.createObjectStore('preferences', { keyPath: 'key' });
        db.createObjectStore('default_list', { keyPath: 'id' });
        db.createObjectStore('shopping_lists', { keyPath: 'id' });
        const li = db.createObjectStore('list_items', { keyPath: 'id' });
        li.createIndex('list_id', 'list_id');
      },
    });
    await v3.add('stores', {
      id: 'st-mb',
      name: 'Oxford Market Basket #62',
      address: '',
      slug: 'oxford-62',
    });
    await v3.add('preferences', { key: 'active_store_id', value: 'st-mb' });
    v3.close();

    vi.resetModules();
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;

    const stores = await db.getAll('stores');
    const bigY = stores.find((s) => s.slug === 'big-y-worcester');
    expect(bigY).toBeDefined();
    // Big Y's full aisle layout and per-store locations come along.
    expect(await db.getAllFromIndex('aisles', 'store_id', bigY!.id)).toHaveLength(26);
    expect(await db.getAllFromIndex('item_locations', 'store_id', bigY!.id)).toHaveLength(182);
    // The user's existing active-store choice is left untouched.
    expect((await db.get('preferences', 'active_store_id'))?.value).toBe('st-mb');
  });

  it('refreshes the Big Y layout on v4→v5, replacing aisles and resetting overrides', async () => {
    const { openDB } = await import('idb');
    const bigYRaw = (await import('@/assets/aisles/big-y-worcester.json')).default;
    const bigYStoreId = bigYRaw.store.id;

    // A v4-shaped DB carrying the OLD Big Y layout plus a manual aisle override.
    const v4 = await openDB('shoop', 4, {
      upgrade(db) {
        db.createObjectStore('stores', { keyPath: 'id' });
        const aisles = db.createObjectStore('aisles', { keyPath: 'id' });
        aisles.createIndex('store_id', 'store_id');
        db.createObjectStore('items', { keyPath: 'id' });
        const il = db.createObjectStore('item_locations', { keyPath: 'id' });
        il.createIndex('item_id', 'item_id');
        il.createIndex('store_id', 'store_id');
        db.createObjectStore('preferences', { keyPath: 'key' });
        db.createObjectStore('default_list', { keyPath: 'id' });
        db.createObjectStore('shopping_lists', { keyPath: 'id' });
        const li = db.createObjectStore('list_items', { keyPath: 'id' });
        li.createIndex('list_id', 'list_id');
      },
    });
    await v4.add('stores', {
      id: 'st-mb',
      name: 'Oxford Market Basket #62',
      address: '',
      slug: 'oxford-62',
    });
    await v4.add('stores', bigYRaw.store);
    // An old Big Y aisle that no longer exists in the new layout.
    await v4.add('aisles', {
      id: 'old-big-y-aisle',
      store_id: bigYStoreId,
      number: '18',
      label: 'Baby & Pet Care',
      sort_order: 24,
    });
    // A user's manual aisle override at Big Y, plus an unrelated oxford location.
    await v4.add('item_locations', {
      id: 'manual-override',
      item_id: 'it-x',
      store_id: bigYStoreId,
      aisle_id: 'old-big-y-aisle',
    });
    await v4.add('item_locations', {
      id: 'oxford-loc',
      item_id: 'it-y',
      store_id: 'st-mb',
      aisle_id: 'ox-ai',
    });
    await v4.add('preferences', { key: 'active_store_id', value: 'st-mb' });
    v4.close();

    vi.resetModules();
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;

    // Big Y aisles are replaced wholesale with the new 26-aisle layout.
    const bigYAisles = await db.getAllFromIndex('aisles', 'store_id', bigYStoreId);
    expect(bigYAisles).toHaveLength(26);
    expect(bigYAisles.some((a) => a.label === 'Frozen')).toBe(true);
    expect(bigYAisles.some((a) => a.id === 'old-big-y-aisle')).toBe(false);

    // The manual override is gone; Big Y locations match the fresh seed count.
    expect(await db.get('item_locations', 'manual-override')).toBeUndefined();
    expect(await db.getAllFromIndex('item_locations', 'store_id', bigYStoreId)).toHaveLength(182);

    // Unrelated stores/locations are untouched.
    expect(await db.get('item_locations', 'oxford-loc')).toBeDefined();
    expect((await db.get('preferences', 'active_store_id'))?.value).toBe('st-mb');
  });

  it('backfills ListItem.unit on v5→v6 for rows created before the field existed', async () => {
    const { openDB } = await import('idb');
    // A v5-shaped DB with a list_items row that predates the `unit` field.
    const v5 = await openDB('shoop', 5, {
      upgrade(db) {
        db.createObjectStore('stores', { keyPath: 'id' });
        const aisles = db.createObjectStore('aisles', { keyPath: 'id' });
        aisles.createIndex('store_id', 'store_id');
        db.createObjectStore('items', { keyPath: 'id' });
        const il = db.createObjectStore('item_locations', { keyPath: 'id' });
        il.createIndex('item_id', 'item_id');
        il.createIndex('store_id', 'store_id');
        db.createObjectStore('preferences', { keyPath: 'key' });
        db.createObjectStore('default_list', { keyPath: 'id' });
        db.createObjectStore('shopping_lists', { keyPath: 'id' });
        const li = db.createObjectStore('list_items', { keyPath: 'id' });
        li.createIndex('list_id', 'list_id');
      },
    });
    await v5.add('list_items', {
      id: 'li-legacy',
      list_id: 'list-1',
      item_id: 'it-1',
      quantity: 3,
      checked: false,
      added_from_default: false,
      created_at: 1,
    } as never);
    v5.close();

    vi.resetModules();
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;

    const row = await db.get('list_items', 'li-legacy');
    expect(row?.unit).toBe('');
    // Other fields are preserved.
    expect(row?.quantity).toBe(3);
  });

  it('leaves a fresh install unaffected by the v6 backfill (empty list_items)', async () => {
    const { dbPromise } = await import('@/db/idbClient');
    const db = await dbPromise;
    expect(await db.count('list_items')).toBe(0);
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
        unit: '',
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
      const userItemId = crypto.randomUUID();
      await db.add('items', {
        id: userItemId,
        name: 'Dragonfruit',
        canonical_name: 'dragonfruit',
      });
      expect(await db.count('items')).toBe(183);

      await resetUserData();

      expect(await db.count('items')).toBe(182);
      expect(await db.get('items', userItemId)).toBeUndefined();
    });

    it('reverts a per-store aisle override (item_location) on a seeded item', async () => {
      const { dbPromise, resetUserData } = await import('@/db/idbClient');
      const db = await dbPromise;
      const [loc] = await db.getAll('item_locations');
      const originalAisle = loc.aisle_id;
      await db.put('item_locations', { ...loc, aisle_id: 'tampered-aisle' });
      expect((await db.get('item_locations', loc.id))?.aisle_id).toBe('tampered-aisle');

      await resetUserData();

      // The override is reverted: no location anywhere still carries the
      // tampered aisle, and the catalog is re-seeded to its full size. (We
      // assert the override is gone rather than that loc.id disappeared: the
      // re-seed reuses the big-y assets' fixed location ids, so a row id may
      // legitimately survive a clear-and-re-add.)
      const stillTampered = (await db.getAll('item_locations')).some(
        (l) => l.aisle_id === 'tampered-aisle',
      );
      expect(stillTampered).toBe(false);
      expect(await db.count('item_locations')).toBe(364);
      const restored = (await db.getAllFromIndex('item_locations', 'item_id', loc.item_id)).find(
        (l) => l.store_id === loc.store_id,
      );
      expect(restored?.aisle_id).toBe(originalAisle);
    });

    it('preserves the seeded stores and aisles and resets the active store', async () => {
      const { dbPromise, resetUserData, ACTIVE_STORE_ID_KEY } = await import('@/db/idbClient');
      const db = await dbPromise;
      const bigY = (await db.getAll('stores')).find((s) => s.slug === 'big-y-worcester')!;
      await db.put('preferences', { key: ACTIVE_STORE_ID_KEY, value: bigY.id });

      await resetUserData();

      expect(await db.count('stores')).toBe(2);
      expect(await db.count('aisles')).toBe(57);
      const oxford = (await db.getAll('stores')).find((s) => s.slug === 'oxford-62')!;
      expect((await db.get('preferences', ACTIVE_STORE_ID_KEY))?.value).toBe(oxford.id);
    });
  });
});
