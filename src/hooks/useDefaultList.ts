import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import { resolveItem } from '@/db/items';
import type { DefaultListEntry } from '@/db/schema';

const QUERY_KEY = ['default_list'] as const;

/**
 * The store-agnostic default list (ADR-0009, ADR-0015): a template of catalog
 * item references with no aisle data. Entries are joined to `items` by the
 * consumer for display.
 */
export function useDefaultList() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const db = await dbPromise;
      return db.getAll('default_list');
    },
  });
}

interface AddDefaultListItemResult {
  itemCreated: boolean;
}

export function useAddDefaultListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<AddDefaultListItemResult> => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Item name cannot be empty');

      const db = await dbPromise;
      // Read phase — outside any transaction (idb does not hold a transaction
      // open across awaits).
      const [allItems, allEntries] = await Promise.all([
        db.getAll('items'),
        db.getAll('default_list'),
      ]);

      const { itemId, itemCreated, newItem } = resolveItem(allItems, trimmed);

      // Dedupe by item_id — the default list is a set of catalog references.
      if (allEntries.some((e) => e.item_id === itemId)) {
        return { itemCreated: false };
      }

      const entry: DefaultListEntry = {
        id: crypto.randomUUID(),
        item_id: itemId,
        quantity: 1,
        unit: '',
        notes: '',
      };

      // Write phase — queue synchronously so the item + entry commit atomically.
      if (itemCreated && newItem) {
        const tx = db.transaction(['items', 'default_list'], 'readwrite');
        tx.objectStore('items').add(newItem);
        tx.objectStore('default_list').add(entry);
        await tx.done;
      } else {
        await db.add('default_list', entry);
      }

      return { itemCreated };
    },
    onSuccess: ({ itemCreated }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
        itemCreated
          ? queryClient.invalidateQueries({ queryKey: ['items'] })
          : Promise.resolve(),
      ]),
  });
}

export function useRemoveDefaultListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const db = await dbPromise;
      await db.delete('default_list', id);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const snapshot = queryClient.getQueryData<DefaultListEntry[]>(QUERY_KEY);
      queryClient.setQueryData<DefaultListEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).filter((e) => e.id !== id),
      );
      return { snapshot };
    },
    onError: (_err, _id, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(QUERY_KEY, context.snapshot);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
