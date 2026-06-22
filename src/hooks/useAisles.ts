import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import type { Aisle } from '@/db/schema';

function aislesKey(storeId?: string) {
  return ['aisles', storeId ?? 'all'] as const;
}

export function useAisles(storeId?: string) {
  return useQuery({
    queryKey: aislesKey(storeId),
    queryFn: async () => {
      const db = await dbPromise;
      const aisles = storeId
        ? await db.getAllFromIndex('aisles', 'store_id', storeId)
        : await db.getAll('aisles');
      return aisles.sort((a, b) => a.sort_order - b.sort_order);
    },
  });
}

interface ReorderAislesInput {
  storeId: string;
  orderedIds: string[];
}

export function useReorderAisles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, orderedIds }: ReorderAislesInput) => {
      const db = await dbPromise;
      // Read phase — outside the transaction (idb does not keep a transaction
      // alive across await boundaries).
      const existing = await db.getAllFromIndex('aisles', 'store_id', storeId);
      const byId = new Map(existing.map((a) => [a.id, a]));

      // Write phase — queue every changed row synchronously, one commit.
      const tx = db.transaction(['aisles'], 'readwrite');
      orderedIds.forEach((aisleId, index) => {
        const aisle = byId.get(aisleId);
        // Skip rows whose ordinal is unchanged to minimise writes.
        if (aisle && aisle.sort_order !== index) {
          tx.objectStore('aisles').put({ ...aisle, sort_order: index });
        }
      });
      await tx.done;
    },
    onMutate: async ({ storeId, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: aislesKey(storeId) });
      const snapshot = queryClient.getQueryData<Aisle[]>(aislesKey(storeId));
      if (snapshot) {
        const byId = new Map(snapshot.map((a) => [a.id, a]));
        const reordered = orderedIds
          .map((id, index) => {
            const aisle = byId.get(id);
            return aisle ? { ...aisle, sort_order: index } : undefined;
          })
          .filter((a): a is Aisle => a !== undefined);
        queryClient.setQueryData<Aisle[]>(aislesKey(storeId), reordered);
      }
      return { snapshot };
    },
    onError: (_err, { storeId }, context) => {
      if (context?.snapshot !== undefined) {
        queryClient.setQueryData(aislesKey(storeId), context.snapshot);
      }
    },
    onSettled: (_data, _err, { storeId }) => {
      queryClient.invalidateQueries({ queryKey: aislesKey(storeId) });
      queryClient.invalidateQueries({ queryKey: aislesKey() });
    },
  });
}
