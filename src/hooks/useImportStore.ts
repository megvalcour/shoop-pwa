import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import { resolveItem } from '@/db/items';
import { slugify } from '@/utils/parseStoreImport';
import type { ParsedStoreImport } from '@/utils/parseStoreImport';
import type { Aisle, Item, ItemLocation, Store } from '@/db/schema';

/**
 * Creates a user-authored store from a validated import (ADR-0024). User stores
 * are IndexedDB-only and additive: items stay in the shared catalog and the new
 * store contributes aisles + per-store `item_locations` (riding ADR-0015), so
 * the existing matcher classifies real items into its aisles from day one. We
 * mint every id ourselves and derive a slug unique against existing stores, so
 * an imported store never aliases onto a bundled one. Does not auto-switch the
 * active store — the user does that from the store detail page.
 */
export function useImportStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (parsed: ParsedStoreImport): Promise<string> => {
      const db = await dbPromise;

      // Read phase — outside any transaction (idb does not keep a transaction
      // alive across await boundaries). Existing slugs drive de-dup; the catalog
      // lets us reuse items by canonical name rather than duplicating them.
      const [existingStores, allItems] = await Promise.all([
        db.getAll('stores'),
        db.getAll('items'),
      ]);

      const slug = uniqueSlug(slugify(parsed.name) || 'store', existingStores);
      const storeId = crypto.randomUUID();
      const store: Store = { id: storeId, name: parsed.name, address: parsed.address, slug };

      const aisles: Aisle[] = [];
      const newItems: Item[] = [];
      const locations: ItemLocation[] = [];

      // Resolve items against a growing catalog map so two aisles naming the same
      // item reuse one catalog row, and a name already in the catalog is reused.
      const catalog = new Map(allItems.map((i) => [i.canonical_name, i.id] as const));

      for (const parsedAisle of parsed.aisles) {
        const aisleId = crypto.randomUUID();
        aisles.push({
          id: aisleId,
          store_id: storeId,
          number: parsedAisle.number,
          label: parsedAisle.label,
          sort_order: parsedAisle.sortOrder,
        });

        // Dedup item_locations within the store: an item named in two aisles
        // lands in the first aisle only.
        const placed = new Set<string>();
        for (const canonical of parsedAisle.items) {
          let itemId = catalog.get(canonical);
          if (!itemId) {
            const resolved = resolveItem(newItems.concat(allItems), canonical);
            itemId = resolved.itemId;
            if (resolved.itemCreated && resolved.newItem) newItems.push(resolved.newItem);
            catalog.set(canonical, itemId);
          }
          if (placed.has(itemId)) continue;
          placed.add(itemId);
          locations.push({
            id: crypto.randomUUID(),
            item_id: itemId,
            store_id: storeId,
            aisle_id: aisleId,
          });
        }
      }

      // Write phase — queue every op synchronously across one transaction so it
      // commits atomically (same idiom as seedDatabase/resetUserData).
      const tx = db.transaction(['stores', 'aisles', 'items', 'item_locations'], 'readwrite');
      tx.objectStore('stores').add(store);
      for (const aisle of aisles) tx.objectStore('aisles').add(aisle);
      for (const item of newItems) tx.objectStore('items').add(item);
      for (const loc of locations) tx.objectStore('item_locations').add(loc);
      await tx.done;

      return storeId;
    },
    onSuccess: () => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stores'] }),
        queryClient.invalidateQueries({ queryKey: ['aisles'] }),
        queryClient.invalidateQueries({ queryKey: ['items'] }),
        queryClient.invalidateQueries({ queryKey: ['item_locations'] }),
      ]);
    },
  });
}

/** Suffix the slug with -2, -3, … until it no longer collides with an existing store. */
function uniqueSlug(base: string, existing: Store[]): string {
  const taken = new Set(existing.map((s) => s.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
