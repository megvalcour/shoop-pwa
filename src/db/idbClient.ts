import { openDB, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  type Aisle,
  type Item,
  type ItemLocation,
  type Store,
  type ShoopDB,
} from '@/db/schema';
import oxfordRaw from '@/assets/aisles/oxford-62.json';
import bigYRaw from '@/assets/aisles/big-y-worcester.json';
import generalRaw from '@/assets/aisles/general.json';

/** preferences key holding the id of the currently-active store. */
export const ACTIVE_STORE_ID_KEY = 'active_store_id';

/**
 * preferences key holding the single user's Eat profile, JSON-serialized
 * (Eat tab Phase 2). Stored in `preferences` rather than a dedicated store so
 * the phase stays schema-free — see `EatProfile` in schema.ts.
 */
export const EAT_PROFILE_KEY = 'eat_profile';

// Raw seed shapes. The oxford-62 asset predates ADR-0015 and still carries the
// per-store fields on each item; we normalize those into `items` +
// `item_locations` below. The big-y asset is already in the post-0015 shape.
interface RawCatalogItem {
  id: string;
  name: string;
  canonical_name: string;
  aisle_id: string;
  store_id: string;
}
const oxfordSeed = oxfordRaw as { store: Store; aisles: Aisle[]; items: RawCatalogItem[] };
const bigYSeed = bigYRaw as { store: Store; aisles: Aisle[]; item_locations: ItemLocation[] };
// The General Store (ADR-0015, tasks/active--general-store.md): a built-in,
// non-surveyed store of generic sections for shopping anywhere not yet loaded.
// Authored in the post-0015 shape (its own item_locations against the shared
// catalog ids), mirroring big-y.
const generalSeed = generalRaw as { store: Store; aisles: Aisle[]; item_locations: ItemLocation[] };

/** Stable id of the built-in General Store (used by the v7 migration guard). */
export const GENERAL_STORE_ID = generalSeed.store.id;

/** The default active store on a fresh install. */
export const DEFAULT_ACTIVE_STORE_ID = oxfordSeed.store.id;

/**
 * The stable seed ids of the three bundled stores, derived directly from the
 * seed assets imported above (no separate flag column or asset). A store is
 * user-authored — and therefore deletable — iff its id is NOT in this set.
 * Deciding deletability by exclusion means every store imported before the
 * delete feature shipped is deletable the moment this lands, with no migration
 * or backfill (see tasks/delete-user-stores plan).
 */
export const BUILTIN_STORE_IDS: ReadonlySet<string> = new Set([
  oxfordSeed.store.id,
  bigYSeed.store.id,
  generalSeed.store.id,
]);

/** Whether `id` belongs to a bundled store (Oxford / Big Y / General). */
export function isBuiltInStore(id: string): boolean {
  return BUILTIN_STORE_IDS.has(id);
}

interface SeedData {
  stores: Store[];
  aisles: Aisle[];
  items: Item[];
  itemLocations: ItemLocation[];
}

/**
 * Build the normalized seed for both stores: a single store-agnostic catalog
 * (`items`) shared across stores, plus per-store `item_locations`. The oxford
 * catalog is the source of `items` (its per-store fields become an oxford
 * `item_location`); the big-y asset contributes only its own `item_locations`
 * against those same shared item ids.
 */
function buildSeedData(): SeedData {
  const items: Item[] = oxfordSeed.items.map((i) => ({
    id: i.id,
    name: i.name,
    canonical_name: i.canonical_name,
  }));

  const oxfordLocations: ItemLocation[] = oxfordSeed.items
    .filter((i) => i.aisle_id)
    .map((i) => ({
      id: crypto.randomUUID(),
      item_id: i.id,
      store_id: i.store_id,
      aisle_id: i.aisle_id,
    }));

  return {
    stores: [oxfordSeed.store, bigYSeed.store, generalSeed.store],
    aisles: [...oxfordSeed.aisles, ...bigYSeed.aisles, ...generalSeed.aisles],
    items,
    itemLocations: [...oxfordLocations, ...bigYSeed.item_locations, ...generalSeed.item_locations],
  };
}

async function upgrade(
  db: IDBPDatabase<ShoopDB>,
  oldVersion: number,
  _newVersion: number | null,
  tx: IDBPTransaction<ShoopDB, ArrayLike<StoreNames<ShoopDB>>, 'versionchange'>,
): Promise<void> {
  if (oldVersion < 1) {
    db.createObjectStore('stores', { keyPath: 'id' });

    const aisles = db.createObjectStore('aisles', { keyPath: 'id' });
    aisles.createIndex('store_id', 'store_id');

    const items = db.createObjectStore('items', { keyPath: 'id' });
    // These indexes were dropped from the schema type in v3 (items are
    // store-agnostic now); they exist here only so the append-only v1 case keeps
    // describing v1 faithfully. Cast required because the current ShoopDB type no
    // longer declares them.
    (items as unknown as IDBObjectStore).createIndex('aisle_id', 'aisle_id');
    (items as unknown as IDBObjectStore).createIndex('store_id', 'store_id');

    db.createObjectStore('default_list', { keyPath: 'id' });
    // weekly_list was removed from ShoopDB in v2; cast required because idb's typed
    // wrapper rejects store names not present in the current schema type.
    (db as unknown as IDBDatabase).createObjectStore('weekly_list', { keyPath: 'id' });
  }

  if (oldVersion < 2) {
    (db as unknown as IDBDatabase).deleteObjectStore('weekly_list');
    db.createObjectStore('shopping_lists', { keyPath: 'id' });
    const listItems = db.createObjectStore('list_items', { keyPath: 'id' });
    listItems.createIndex('list_id', 'list_id');
  }

  if (oldVersion < 3) {
    const itemLocations = db.createObjectStore('item_locations', { keyPath: 'id' });
    itemLocations.createIndex('item_id', 'item_id');
    itemLocations.createIndex('store_id', 'store_id');
    db.createObjectStore('preferences', { keyPath: 'key' });

    // Data-migrate existing rows (only when upgrading a populated v2 DB; a fresh
    // install has an empty `items` store and is populated by seedDatabase). Each
    // item's per-store fields move into an item_location, then the item is
    // rewritten store-agnostic. The 'items' index drops are implicit: the v3
    // schema type no longer declares them, but the underlying indexes from v1
    // remain harmless — we simply stop writing the fields they index.
    const itemsStore = tx.objectStore('items');
    const raw = (await itemsStore.getAll()) as unknown as RawCatalogItem[];
    for (const item of raw) {
      if (item.aisle_id) {
        await tx.objectStore('item_locations').add({
          id: crypto.randomUUID(),
          item_id: item.id,
          store_id: item.store_id,
          aisle_id: item.aisle_id,
        });
      }
      await itemsStore.put({
        id: item.id,
        name: item.name,
        canonical_name: item.canonical_name,
      } as Item);
    }
  }

  if (oldVersion < 4) {
    // Graft in the Big Y store (ADR-0015) for existing installs. The v3 path
    // only seeded Big Y on a *fresh* install: seedDatabase() early-returns once
    // any store exists, so every device already seeded with Market Basket (at
    // v1/v2) — and every device that already ran the v3 upgrade — reached v3
    // without Big Y ever appearing in the store switcher. Backfill it against
    // the shared catalog for any populated DB that is still missing it. A fresh
    // install reaches this case with an empty `stores` store and is fully
    // populated by seedDatabase() afterward, so it is intentionally skipped here
    // (grafting Big Y now would make seedDatabase early-return before seeding
    // the Market Basket catalog).
    const storesStore = tx.objectStore('stores');
    const populated = (await storesStore.count()) > 0;
    const hasBigY = (await storesStore.get(bigYSeed.store.id)) != null;
    if (populated && !hasBigY) {
      storesStore.add(bigYSeed.store);
      for (const aisle of bigYSeed.aisles) tx.objectStore('aisles').add(aisle);
      for (const loc of bigYSeed.item_locations) tx.objectStore('item_locations').add(loc);
      const prefs = tx.objectStore('preferences');
      if ((await prefs.get(ACTIVE_STORE_ID_KEY)) == null) {
        prefs.put({ key: ACTIVE_STORE_ID_KEY, value: DEFAULT_ACTIVE_STORE_ID });
      }
    }
  }

  if (oldVersion < 5) {
    // Refresh the Big Y layout (tasks/active--big-y-aisle-adjustments.md): the
    // numbered aisles and the per-store item_locations are replaced wholesale to
    // match the store's new floor plan, and a Frozen department is added. Any
    // prior manual Big Y aisle picks are intentionally reset — those items simply
    // re-classify against the new layout. Other stores, user items, lists, and
    // the default list are untouched. Fresh installs (empty `stores`) are skipped
    // here and fully populated by seedDatabase() afterward, same guard as v4.
    const storesStore = tx.objectStore('stores');
    const populated = (await storesStore.count()) > 0;
    if (populated) {
      const hasBigY = (await storesStore.get(bigYSeed.store.id)) != null;
      if (hasBigY) {
        // Drop the old Big Y aisles (by store_id index) and all Big Y locations.
        const aislesStore = tx.objectStore('aisles');
        const oldAisleKeys = await aislesStore.index('store_id').getAllKeys(bigYSeed.store.id);
        for (const key of oldAisleKeys) await aislesStore.delete(key);

        const locationsStore = tx.objectStore('item_locations');
        const oldLocationKeys = await locationsStore
          .index('store_id')
          .getAllKeys(bigYSeed.store.id);
        for (const key of oldLocationKeys) await locationsStore.delete(key);

        for (const aisle of bigYSeed.aisles) aislesStore.add(aisle);
        for (const loc of bigYSeed.item_locations) locationsStore.add(loc);
      } else {
        // Older install that never grafted Big Y — graft it fresh with the new
        // layout (mirrors the v4 backfill).
        storesStore.add(bigYSeed.store);
        for (const aisle of bigYSeed.aisles) tx.objectStore('aisles').add(aisle);
        for (const loc of bigYSeed.item_locations) tx.objectStore('item_locations').add(loc);
        const prefs = tx.objectStore('preferences');
        if ((await prefs.get(ACTIVE_STORE_ID_KEY)) == null) {
          prefs.put({ key: ACTIVE_STORE_ID_KEY, value: DEFAULT_ACTIVE_STORE_ID });
        }
      }
    }
  }

  if (oldVersion < 6) {
    // Backfill ListItem.unit on existing rows so reads are type-safe
    // (tasks/active--item-quantities-dedup.md). A fresh install reaches this
    // with an empty list_items store and is unaffected; new rows set unit
    // explicitly from here on.
    const store = tx.objectStore('list_items');
    let cursor = await store.openCursor();
    while (cursor) {
      if (cursor.value.unit === undefined) {
        await cursor.update({ ...cursor.value, unit: '' });
      }
      cursor = await cursor.continue();
    }
  }

  if (oldVersion < 7) {
    // Graft in the built-in General Store (tasks/active--general-store.md) for
    // existing installs, mirroring the Big Y backfill. seedDatabase()
    // early-returns once any store exists, so already-populated devices would
    // never see the General Store without this. A fresh install reaches this
    // case with an empty `stores` store and is fully populated by seedDatabase()
    // afterward, so it is intentionally skipped here. Idempotent: guarded on the
    // store id. The active-store preference is left untouched — the General
    // Store is purely additive (Oxford stays the default current store).
    const storesStore = tx.objectStore('stores');
    const populated = (await storesStore.count()) > 0;
    const hasGeneral = (await storesStore.get(GENERAL_STORE_ID)) != null;
    if (populated && !hasGeneral) {
      storesStore.add(generalSeed.store);
      for (const aisle of generalSeed.aisles) tx.objectStore('aisles').add(aisle);
      for (const loc of generalSeed.item_locations) tx.objectStore('item_locations').add(loc);
    }
  }

  if (oldVersion < 8) {
    // Update the General Store subtitle from "Common grocery layout" to
    // "Any ol' store" on existing installs. This is a non-breaking data fixup
    // (no schema change). Fresh installs pick up the updated address from the
    // seed JSON directly and skip this via the empty-stores guard in seedDatabase.
    const storesStore = tx.objectStore('stores');
    const general = await storesStore.get(GENERAL_STORE_ID);
    if (general) {
      await storesStore.put({ ...general, address: 'Any ol\' store' });
    }
  }
}

async function seedDatabase(db: IDBPDatabase<ShoopDB>): Promise<void> {
  if ((await db.count('stores')) !== 0) return;

  const seed = buildSeedData();
  const tx = db.transaction(
    ['stores', 'aisles', 'items', 'item_locations', 'preferences'],
    'readwrite',
  );
  for (const store of seed.stores) tx.objectStore('stores').add(store);
  for (const aisle of seed.aisles) tx.objectStore('aisles').add(aisle);
  for (const item of seed.items) tx.objectStore('items').add(item);
  for (const loc of seed.itemLocations) tx.objectStore('item_locations').add(loc);
  tx.objectStore('preferences').put({ key: ACTIVE_STORE_ID_KEY, value: DEFAULT_ACTIVE_STORE_ID });
  await tx.done;
}

export const dbPromise: Promise<IDBPDatabase<ShoopDB>> = openDB<ShoopDB>(DB_NAME, DB_VERSION, {
  upgrade,
}).then((db) => seedDatabase(db).then(() => db));

/**
 * Deletes all user-created data (shopping lists, list items, the default list,
 * user-added items, and aisle overrides) while restoring the seeded store data
 * to its pristine state.
 *
 * The store-managed stores (`stores`, `aisles`, `items`, `item_locations`) are
 * cleared and re-seeded verbatim, which drops user items, reverts per-store
 * aisle overrides (now held in `item_locations`), and restores both catalogs.
 * The active-store preference is reset to the default. The purely-user stores
 * are simply cleared.
 */
export async function resetUserData(): Promise<void> {
  const db = await dbPromise;
  const seed = buildSeedData();
  const tx = db.transaction(
    [
      'shopping_lists',
      'list_items',
      'default_list',
      'stores',
      'aisles',
      'items',
      'item_locations',
      'preferences',
    ],
    'readwrite',
  );
  // Queue every op synchronously — idb auto-commits across await boundaries, so
  // there are no awaits until tx.done. clear() is ordered before the re-seed
  // adds, so each store is wiped and then repopulated within one atomic commit.
  tx.objectStore('shopping_lists').clear();
  tx.objectStore('list_items').clear();
  tx.objectStore('default_list').clear();
  tx.objectStore('stores').clear();
  tx.objectStore('aisles').clear();
  tx.objectStore('items').clear();
  tx.objectStore('item_locations').clear();

  for (const store of seed.stores) tx.objectStore('stores').add(store);
  for (const aisle of seed.aisles) tx.objectStore('aisles').add(aisle);
  for (const item of seed.items) tx.objectStore('items').add(item);
  for (const loc of seed.itemLocations) tx.objectStore('item_locations').add(loc);
  tx.objectStore('preferences').put({ key: ACTIVE_STORE_ID_KEY, value: DEFAULT_ACTIVE_STORE_ID });

  await tx.done;
}

/**
 * Deletes a user-authored store and everything it owns: the store row, its
 * aisles, and its per-store `item_locations` (all index-scoped by `store_id`).
 *
 * The shared, store-agnostic `items` catalog is intentionally left in place —
 * those rows may be referenced by the default list, shopping lists, or other
 * stores' locations (Decision 1). If the deleted store is the active one, the
 * `active_store_id` preference is reset to the default store so the persisted
 * value never dangles (Decision 2).
 *
 * Bundled stores (Oxford / Big Y / General) are not deletable: this rejects on
 * a built-in id, backstopping the UI which never offers the affordance.
 */
export async function deleteStore(storeId: string): Promise<void> {
  if (isBuiltInStore(storeId)) {
    throw new Error('Built-in stores cannot be deleted.');
  }

  const db = await dbPromise;

  // Read phase — outside the tx (idb does not keep a transaction alive across
  // awaits). Gather the rows this store owns and the current active pref.
  const [aisleKeys, locationKeys, activePref] = await Promise.all([
    db.getAllKeysFromIndex('aisles', 'store_id', storeId),
    db.getAllKeysFromIndex('item_locations', 'store_id', storeId),
    db.get('preferences', ACTIVE_STORE_ID_KEY),
  ]);

  // Write phase — queue every op synchronously across one transaction so it
  // commits atomically (same idiom as resetUserData). `items` is excluded.
  const tx = db.transaction(['stores', 'aisles', 'item_locations', 'preferences'], 'readwrite');
  tx.objectStore('stores').delete(storeId);
  for (const key of aisleKeys) tx.objectStore('aisles').delete(key);
  for (const key of locationKeys) tx.objectStore('item_locations').delete(key);
  if (activePref?.value === storeId) {
    tx.objectStore('preferences').put({ key: ACTIVE_STORE_ID_KEY, value: DEFAULT_ACTIVE_STORE_ID });
  }
  await tx.done;
}
