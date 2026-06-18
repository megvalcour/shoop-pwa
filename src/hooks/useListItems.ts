import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import type { Item, ListItem } from '@/db/schema';

function listItemsKey(listId: string) {
  return ['list_items', listId] as const;
}

export function useListItems(listId: string) {
  return useQuery({
    queryKey: listItemsKey(listId),
    queryFn: async () => {
      const db = await dbPromise;
      return db.getAllFromIndex('list_items', 'list_id', listId);
    },
  });
}

interface AddListItemInput {
  listId: string;
  name: string;
}

interface AddListItemResult {
  itemCreated: boolean;
}

export function useAddListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, name }: AddListItemInput): Promise<AddListItemResult> => {
      const trimmed = name.trim();
      // Finding 4: throw so onSuccess doesn't fire as a false positive on empty input
      if (!trimmed) throw new Error('Item name cannot be empty');

      const canonical = trimmed.toLowerCase();
      const db = await dbPromise;

      // Read phase — outside any transaction. idb does not keep transactions alive
      // across await boundaries, so reads and writes must be separate operations.
      // The form's disabled={isPending} prevents concurrent mutations in practice.
      const [allItems, allListItems, allStores] = await Promise.all([
        db.getAll('items'),
        db.getAll('list_items'),
        db.getAll('stores'),
      ]);

      const existing = allItems.find((i) => i.canonical_name === canonical);
      let itemId: string;
      let itemCreated = false;

      if (existing) {
        itemId = existing.id;
      } else {
        // Finding 1: throw rather than silently writing store_id = ''
        if (!allStores[0]) throw new Error('No store found — add a store before adding items');
        itemId = crypto.randomUUID();
        itemCreated = true;
      }

      // Finding 2: skip if (list_id, item_id) pair already exists
      if (allListItems.some((li) => li.list_id === listId && li.item_id === itemId)) {
        return { itemCreated: false };
      }

      const listItem: ListItem = {
        id: crypto.randomUUID(),
        list_id: listId,
        item_id: itemId,
        quantity: 1,
        checked: false,
        added_from_default: false,
      };

      // Write phase — queue all writes synchronously within a transaction so
      // the transaction commits in one shot without auto-commit racing.
      if (itemCreated) {
        const tx = db.transaction(['items', 'list_items'], 'readwrite');
        const newItem: Item = {
          id: itemId,
          name: trimmed,
          canonical_name: canonical,
          aisle_id: '',
          store_id: allStores[0].id,
        };
        tx.objectStore('items').add(newItem);
        tx.objectStore('list_items').add(listItem);
        await tx.done;
      } else {
        await db.add('list_items', listItem);
      }

      return { itemCreated };
    },
    onSuccess: ({ itemCreated }, { listId }) => {
      queryClient.invalidateQueries({ queryKey: listItemsKey(listId) });
      // Finding 3: invalidate items cache when a new Item row was written
      if (itemCreated) {
        queryClient.invalidateQueries({ queryKey: ['items'] });
      }
    },
  });
}
