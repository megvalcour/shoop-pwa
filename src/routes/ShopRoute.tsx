import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { useShoppingLists } from '@/hooks/useShoppingLists';
import { useCreateAndNavigateToList } from '@/hooks/useCreateAndNavigateToList';

export default function ShopRoute() {
  const navigate = useNavigate();
  const { data: lists, isPending, isError } = useShoppingLists();
  const { createAndNavigate, isPending: isCreating, isError: isCreateError } = useCreateAndNavigateToList();

  useEffect(() => {
    if (!isPending && lists && lists.length > 0) {
      navigate(`/lists/${lists[0].id}`, { replace: true });
    }
  }, [isPending, lists, navigate]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-muted">Loading…</span>
      </div>
    );
  }

  if (isError && !lists?.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-destructive">Failed to load lists.</span>
      </div>
    );
  }

  if (lists && lists.length > 0) {
    return null;
  }

  return (
    <div className="relative flex flex-col h-full">
      <p className="text-center text-text-muted mt-16">No lists yet. Tap + to start shopping.</p>
      {isCreateError && (
        <p className="text-center text-destructive text-sm mt-2">Failed to create list. Please try again.</p>
      )}
      <button
        type="button"
        aria-label="New list"
        disabled={isCreating}
        onClick={createAndNavigate}
        className="fixed bottom-20 right-6 w-14 h-14 rounded-full bg-accent text-white shadow-lg flex items-center justify-center disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faPlus} />
      </button>
    </div>
  );
}
