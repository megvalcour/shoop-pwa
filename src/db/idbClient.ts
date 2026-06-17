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
