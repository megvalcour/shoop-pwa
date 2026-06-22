import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useShoppingLists } from '@/hooks/useShoppingLists';
import NewListFab from '@/components/organisms/NewListFab';

export default function ShopRoute() {
  const navigate = useNavigate();
  const { data: lists, isPending, isError } = useShoppingLists();

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
      <NewListFab />
    </div>
  );
}
