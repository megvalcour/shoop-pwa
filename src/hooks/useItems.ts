import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import type { ItemLocation } from '@/db/schema';

export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const db = await dbPromise;
      return db.getAll('items');
    },
  });
}

function itemLocationsKey(storeId?: string) {
  return ['item_locations', storeId ?? 'all'] as const;
}

/** Per-store aisle assignments for the catalog (ADR-0015). */
export function useItemLocations(storeId?: string) {
  return useQuery({
    queryKey: itemLocationsKey(storeId),
    queryFn: async () => {
      const db = await dbPromise;
      return storeId
        ? db.getAllFromIndex('item_locations', 'store_id', storeId)
        : db.getAll('item_locations');
    },
    enabled: storeId !== '',
  });
}

interface UpsertItemLocationInput {
  itemId: string;
  storeId: string;
  aisleId: string;
  /**
   * `true` for classifier-driven writes. An auto write is skipped when a
   * location for `(itemId, storeId)` already exists, so a late auto-classify can
   * never clobber a manual pick at that store. Manual writes (default) are
   * unconditional. This is the per-store override lock from ADR-0015.
   */
  auto?: boolean;
}

export function useUpsertItemLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, storeId, aisleId, auto = false }: UpsertItemLocationInput) => {
      const db = await dbPromise;
      // Read phase — find an existing location for this (item, store) pair.
      const forItem = await db.getAllFromIndex('item_locations', 'item_id', itemId);
      const existing = forItem.find((loc) => loc.store_id === storeId);

      if (auto && existing) return; // manual choice already set for this store — keep it.

      const row: ItemLocation = existing
        ? { ...existing, aisle_id: aisleId }
        : { id: crypto.randomUUID(), item_id: itemId, store_id: storeId, aisle_id: aisleId };
      await db.put('item_locations', row);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item_locations'] });
    },
  });
}
