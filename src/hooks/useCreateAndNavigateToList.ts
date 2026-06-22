import { useNavigate } from 'react-router';
import { useCreateShoppingList } from '@/hooks/useShoppingLists';

export function useCreateAndNavigateToList() {
  const navigate = useNavigate();
  const mutation = useCreateShoppingList();

  async function createAndNavigate(opts?: { seedFromDefault?: boolean }) {
    try {
      const newList = await mutation.mutateAsync({ seedFromDefault: opts?.seedFromDefault });
      navigate(`/lists/${newList.id}`);
    } catch {
      // error surfaced via mutation.isError
    }
  }

  return { createAndNavigate, isPending: mutation.isPending, isError: mutation.isError };
}
