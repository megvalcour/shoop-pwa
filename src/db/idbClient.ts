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

/** preferences key holding the id of the currently-active store. */
export const ACTIVE_STORE_ID_KEY = 'active_store_id';

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

/** The default active store on a fresh install. */
const DEFAULT_ACTIVE_STORE_ID = oxfordSeed.store.id;

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
    stores: [oxfordSeed.store, bigYSeed.store],
    aisles: [...oxfordSeed.aisles, ...bigYSeed.aisles],
    items,
    itemLocations: [...oxfordLocations, ...bigYSeed.item_locations],
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
