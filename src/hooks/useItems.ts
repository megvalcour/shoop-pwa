import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

interface UpdateItemAisleInput {
  itemId: string;
  aisleId: string;
}

export function useUpdateItemAisle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, aisleId }: UpdateItemAisleInput) => {
      const db = await dbPromise;
      const item = await db.get('items', itemId);
      if (!item) throw new Error(`Item not found: ${itemId}`);
      await db.put('items', { ...item, aisle_id: aisleId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
