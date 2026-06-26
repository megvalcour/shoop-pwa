import { useQuery } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import { useActiveStoreId } from '@/hooks/usePreferences';

const QUERY_KEY = ['stores'] as const;

export function useStores() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const db = await dbPromise;
      const stores = await db.getAll('stores');
      return stores.sort((a, b) => {
        if (a.slug === 'general') return 1;
        if (b.slug === 'general') return -1;
        return 0;
      });
    },
  });
}

/**
 * The persisted active store (ADR-0015). Resolves the `active_store_id`
 * preference against the store list, falling back to the first store.
 */
export function useActiveStore() {
  const query = useStores();
  const { data: activeStoreId } = useActiveStoreId();
  const stores = query.data;
  const active = activeStoreId
    ? (stores?.find((s) => s.id === activeStoreId) ?? stores?.[0])
    : stores?.[0];
  return { ...query, data: active };
}
