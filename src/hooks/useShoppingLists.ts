import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import type { ListItem, ShoppingList } from '@/db/schema';

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

interface CreateShoppingListInput {
  /**
   * When true, seed the new list with `list_items` copied from the default list
   * (ADR-0009 `added_from_default`). Items remain store-agnostic (ADR-0015);
   * their aisle placement classifies per-store on the list detail screen.
   */
  seedFromDefault?: boolean;
}

export function useCreateShoppingList() {
  const queryClient = useQueryClient();
  return useMutation<ShoppingList, Error, CreateShoppingListInput | void>({
    mutationFn: async (input): Promise<ShoppingList> => {
      const seedFromDefault = input?.seedFromDefault ?? false;
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

      // Read the default entries before opening the write transaction — idb does
      // not keep a transaction alive across an await.
      const defaultEntries = seedFromDefault ? await db.getAll('default_list') : [];

      const seededItems: ListItem[] = defaultEntries.map((entry) => ({
        id: crypto.randomUUID(),
        list_id: record.id,
        item_id: entry.item_id,
        quantity: entry.quantity,
        unit: entry.unit,
        checked: false,
        added_from_default: true,
        created_at: Date.now(),
      }));

      if (seededItems.length > 0) {
        // List row + every seeded item commit in one transaction.
        const tx = db.transaction(['shopping_lists', 'list_items'], 'readwrite');
        tx.objectStore('shopping_lists').add(record);
        for (const li of seededItems) tx.objectStore('list_items').add(li);
        await tx.done;
      } else {
        await db.add('shopping_lists', record);
      }

      return record;
    },
    onSuccess: (record) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['list_items', record.id] }),
      ]),
  });
}

export function useRenameShoppingList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const db = await dbPromise;
      const existing = await db.get('shopping_lists', id);
      if (!existing) throw new Error(`Shopping list not found: ${id}`);
      await db.put('shopping_lists', { ...existing, name: name.trim() });
    },
    onMutate: async ({ id, name }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<ShoppingList[]>(QUERY_KEY);
      queryClient.setQueryData<ShoppingList[]>(QUERY_KEY, (lists) =>
        lists?.map((l) => (l.id === id ? { ...l, name: name.trim() } : l)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(QUERY_KEY, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
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
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['list_items', id] });
    },
  });
}
