import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type Aisle, type Item, type Store, type ShoopDB } from '@/db/schema';
import seedDataRaw from '@/assets/aisles/oxford-62.json';

const seedData = seedDataRaw as { store: Store; aisles: Aisle[]; items: Item[] };

function upgrade(db: IDBPDatabase<ShoopDB>, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore('stores', { keyPath: 'id' });

    const aisles = db.createObjectStore('aisles', { keyPath: 'id' });
    aisles.createIndex('store_id', 'store_id');

    const items = db.createObjectStore('items', { keyPath: 'id' });
    items.createIndex('aisle_id', 'aisle_id');
    items.createIndex('store_id', 'store_id');

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
}

async function seedDatabase(db: IDBPDatabase<ShoopDB>): Promise<void> {
  if ((await db.count('stores')) !== 0) return;

  const tx = db.transaction(['stores', 'aisles', 'items'], 'readwrite');
  tx.objectStore('stores').add(seedData.store);
  for (const aisle of seedData.aisles) tx.objectStore('aisles').add(aisle);
  for (const item of seedData.items) tx.objectStore('items').add(item);
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
 * The `items` store mixes seeded catalog items with user-added ones and has no
 * flag distinguishing them; an aisle "override" is a user edit written in place
 * onto a seeded item. Both are reset the same way: the store-managed stores
 * (`stores`, `aisles`, `items`) are cleared and re-seeded verbatim from the seed
 * file, which drops user items, reverts aisle overrides, and restores the
 * catalog. The purely-user stores are simply cleared.
 */
export async function resetUserData(): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(
    ['shopping_lists', 'list_items', 'default_list', 'stores', 'aisles', 'items'],
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

  tx.objectStore('stores').add(seedData.store);
  for (const aisle of seedData.aisles) tx.objectStore('aisles').add(aisle);
  for (const item of seedData.items) tx.objectStore('items').add(item);

  await tx.done;
}
