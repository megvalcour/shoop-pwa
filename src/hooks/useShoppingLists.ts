import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import type { ShoppingList } from '@/db/schema';

const QUERY_KEY = ['shopping_lists'] as const;

export function useShoppingLists() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const db = await dbPromise;
      const all = await db.getAll('shopping_lists');
      return all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });
}

export function useCreateShoppingList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ShoppingList> => {
      const db = await dbPromise;
      const stores = await db.getAll('stores');
      const storeName = stores[0]?.name ?? 'Store';
      const now = new Date();
      const datePart = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      const record: ShoppingList = {
        id: crypto.randomUUID(),
        name: `${storeName} - ${datePart}`,
        created_at: now.toISOString(),
      };
      await db.add('shopping_lists', record);
      return record;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteShoppingList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const db = await dbPromise;
      const tx = db.transaction(['shopping_lists', 'list_items'], 'readwrite');
      const itemKeys = await tx.objectStore('list_items').index('list_id').getAllKeys(id);
      await tx.objectStore('shopping_lists').delete(id);
      await Promise.all(itemKeys.map((key) => tx.objectStore('list_items').delete(key)));
      await tx.done;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
