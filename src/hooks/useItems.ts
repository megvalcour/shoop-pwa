import { useQuery } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';

export function useItems() {
  return useQuery({
    queryKey: ['items'],
    queryFn: async () => {
      const db = await dbPromise;
      return db.getAll('items');
    },
  });
}
