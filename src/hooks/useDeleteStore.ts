import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteStore } from '@/db/idbClient';
import { ACTIVE_STORE_QUERY_KEY } from '@/hooks/usePreferences';

/**
 * Deletes a user-authored store and the rows it owns (aisles + per-store
 * `item_locations`), then refreshes every store-keyed cache. Mirrors
 * `useImportStore`'s invalidation set minus `['items']` — the shared catalog is
 * untouched by a delete (Decision 1). The active-store preference is reset in
 * the data layer when the deleted store was current, so we invalidate it too.
 */
export function useDeleteStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) => deleteStore(storeId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stores'] }),
        queryClient.invalidateQueries({ queryKey: ['aisles'] }),
        queryClient.invalidateQueries({ queryKey: ['item_locations'] }),
        queryClient.invalidateQueries({ queryKey: ACTIVE_STORE_QUERY_KEY }),
      ]),
  });
}
