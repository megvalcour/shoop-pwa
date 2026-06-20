import { useNavigate } from 'react-router';
import { useCreateShoppingList } from '@/hooks/useShoppingLists';

export function useCreateAndNavigateToList() {
  const navigate = useNavigate();
  const mutation = useCreateShoppingList();

  async function createAndNavigate() {
    try {
      const newList = await mutation.mutateAsync();
      navigate(`/lists/${newList.id}`);
    } catch {
      // error surfaced via mutation.isError
    }
  }

  return { createAndNavigate, isPending: mutation.isPending, isError: mutation.isError };
}
