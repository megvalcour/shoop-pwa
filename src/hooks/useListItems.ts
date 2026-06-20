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
  newItemId: string;
}

export function useAddListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, name }: AddListItemInput): Promise<AddListItemResult> => {
      const trimmed = name.trim();
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
        if (!allStores[0]) throw new Error('No store found — add a store before adding items');
        itemId = crypto.randomUUID();
        itemCreated = true;
      }

      if (allListItems.some((li) => li.list_id === listId && li.item_id === itemId)) {
        return { itemCreated: false, newItemId: '' };
      }

      const listItem: ListItem = {
        id: crypto.randomUUID(),
        list_id: listId,
        item_id: itemId,
        quantity: 1,
        checked: false,
        added_from_default: false,
        created_at: Date.now(),
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

      return { itemCreated, newItemId: itemId };
    },
    // Return the invalidation promise so mutateAsync stays pending until the
    // refetch settles. This keeps the list query and the resolved mutation in
    // lockstep — without it, the post-mutation refetch resolves after the
    // mutation has already settled, so an observer can miss the trailing update.
    onSuccess: ({ itemCreated }, { listId }) => {
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: listItemsKey(listId) }),
        itemCreated
          ? queryClient.invalidateQueries({ queryKey: ['items'] })
          : Promise.resolve(),
      ]);
    },
  });
}

interface ToggleListItemInput {
  id: string;
  listId: string;
}

export function useToggleListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: ToggleListItemInput) => {
      const db = await dbPromise;
      const row = await db.get('list_items', id);
      if (!row) throw new Error(`list_items row not found: ${id}`);
      await db.put('list_items', { ...row, checked: !row.checked });
    },
    onMutate: async ({ id, listId }) => {
      await queryClient.cancelQueries({ queryKey: listItemsKey(listId) });
      const snapshot = queryClient.getQueryData<ListItem[]>(listItemsKey(listId));
      queryClient.setQueryData<ListItem[]>(listItemsKey(listId), (old) =>
        (old ?? []).map((li) => (li.id === id ? { ...li, checked: !li.checked } : li)),
      );
      return { snapshot };
    },
    onError: (_err, { listId }, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(listItemsKey(listId), context.snapshot);
      }
    },
    onSettled: (_data, _err, { listId }) => {
      queryClient.invalidateQueries({ queryKey: listItemsKey(listId) });
    },
  });
}

interface DeleteListItemInput {
  id: string;
  listId: string;
}

export function useDeleteListItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: DeleteListItemInput) => {
      const db = await dbPromise;
      await db.delete('list_items', id);
    },
    onMutate: async ({ id, listId }) => {
      await queryClient.cancelQueries({ queryKey: listItemsKey(listId) });
      const snapshot = queryClient.getQueryData<ListItem[]>(listItemsKey(listId));
      queryClient.setQueryData<ListItem[]>(
        listItemsKey(listId),
        (old) => (old ?? []).filter((li) => li.id !== id),
      );
      return { snapshot };
    },
    onError: (_err, { listId }, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(listItemsKey(listId), context.snapshot);
      }
    },
    onSettled: (_data, _err, { listId }) => {
      queryClient.invalidateQueries({ queryKey: listItemsKey(listId) });
    },
  });
}
