import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resetUserData } from '@/db/idbClient';

export function useResetData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetUserData,
    onSuccess: () => {
      // Every persistent store changed, so refetch all caches (shopping_lists,
      // items, every list_items query, etc.).
      queryClient.invalidateQueries();
    },
  });
}
