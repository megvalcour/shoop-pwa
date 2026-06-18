import { useQuery } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';

export function useAisles(storeId?: string) {
  return useQuery({
    queryKey: ['aisles', storeId ?? 'all'],
    queryFn: async () => {
      const db = await dbPromise;
      const aisles = storeId
        ? await db.getAllFromIndex('aisles', 'store_id', storeId)
        : await db.getAll('aisles');
      return aisles.sort((a, b) => a.sort_order - b.sort_order);
    },
  });
}
