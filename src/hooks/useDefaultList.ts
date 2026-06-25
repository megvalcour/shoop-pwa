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
  /** True when the add resolved to an existing entry whose quantity was bumped. */
  incremented: boolean;
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

      // Duplicate add (case-insensitive exact name, via resolveItem): bump the
      // existing entry's quantity by one step instead of adding a second row.
      // Spread preserves the entry's unit and notes.
      const existing = allEntries.find((e) => e.item_id === itemId);
      if (existing) {
        await db.put('default_list', { ...existing, quantity: existing.quantity + 1 });
        return { itemCreated: false, incremented: true };
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

      return { itemCreated, incremented: false };
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

interface UpdateDefaultListItemInput {
  id: string;
  quantity: number;
  unit: string;
}

export function useUpdateDefaultListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, quantity, unit }: UpdateDefaultListItemInput) => {
      const db = await dbPromise;
      const row = await db.get('default_list', id);
      if (!row) throw new Error(`default_list entry not found: ${id}`);
      // Spread preserves notes (not edited here).
      await db.put('default_list', { ...row, quantity, unit });
    },
    onMutate: async ({ id, quantity, unit }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const snapshot = queryClient.getQueryData<DefaultListEntry[]>(QUERY_KEY);
      queryClient.setQueryData<DefaultListEntry[]>(QUERY_KEY, (old) =>
        (old ?? []).map((e) => (e.id === id ? { ...e, quantity, unit } : e)),
      );
      return { snapshot };
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(QUERY_KEY, context.snapshot);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
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
