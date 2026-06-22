import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise, ACTIVE_STORE_ID_KEY } from '@/db/idbClient';

export const ACTIVE_STORE_QUERY_KEY = ['preferences', ACTIVE_STORE_ID_KEY] as const;

/**
 * The id of the currently-active store, read from the `preferences` store. Falls
 * back to the first store's id when no preference has been written yet (see
 * ADR-0015).
 */
export function useActiveStoreId() {
  return useQuery({
    queryKey: ACTIVE_STORE_QUERY_KEY,
    queryFn: async () => {
      const db = await dbPromise;
      const pref = await db.get('preferences', ACTIVE_STORE_ID_KEY);
      if (pref?.value) return pref.value;
      const stores = await db.getAll('stores');
      return stores[0]?.id ?? null;
    },
  });
}

export function useSetActiveStoreId() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (storeId: string) => {
      const db = await dbPromise;
      await db.put('preferences', { key: ACTIVE_STORE_ID_KEY, value: storeId });
      return storeId;
    },
    onSuccess: () => {
      // The active store feeds the catalog view, aisle buckets, and the matcher's
      // candidate set; refresh the preference and everything keyed off it.
      queryClient.invalidateQueries({ queryKey: ACTIVE_STORE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['item_locations'] });
    },
  });
}
