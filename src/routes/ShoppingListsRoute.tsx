import { useNavigate } from 'react-router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import ShoppingListCard from '@/components/molecules/ShoppingListCard';
import { useShoppingLists, useCreateShoppingList } from '@/hooks/useShoppingLists';

export default function ShoppingListsRoute() {
  const navigate = useNavigate();
  const { data: lists = [], isPending, isError } = useShoppingLists();
  const mutation = useCreateShoppingList();

  async function handleNewList() {
    try {
      const newList = await mutation.mutateAsync();
      navigate(`/lists/${newList.id}`);
    } catch {
      // error surfaced via mutation.isError
    }
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-muted">Loading…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-destructive">Failed to load lists.</span>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col">
      <div className="px-4 py-4 flex flex-col gap-3">
        {lists.length === 0 ? (
          <p className="text-center text-text-muted mt-16">No lists yet. Tap + to create one.</p>
        ) : (
          lists.map((list) => (
            <ShoppingListCard
              key={list.id}
              list={list}
              onClick={() => navigate(`/lists/${list.id}`)}
            />
          ))
        )}
      </div>

      <button
        type="button"
        aria-label="New list"
        disabled={mutation.isPending}
        onClick={handleNewList}
        className="fixed bottom-20 right-6 w-14 h-14 rounded-full bg-accent text-white shadow-lg flex items-center justify-center disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>
    </div>
  );
}
