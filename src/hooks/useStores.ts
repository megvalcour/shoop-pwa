import { useQuery } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';

export function useStores() {
  return useQuery({
    queryKey: ['stores'],
    queryFn: async () => {
      const db = await dbPromise;
      return db.getAll('stores');
    },
  });
}
