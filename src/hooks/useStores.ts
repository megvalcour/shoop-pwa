import { useQuery } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';

const QUERY_KEY = ['stores'] as const;

export function useStores() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const db = await dbPromise;
      return db.getAll('stores');
    },
  });
}

export function useActiveStore() {
  const query = useStores();
  return { ...query, data: query.data?.[0] };
}
