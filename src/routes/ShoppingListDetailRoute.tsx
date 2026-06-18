import { useParams } from 'react-router';
import { useShoppingLists } from '@/hooks/useShoppingLists';
import AddItemForm from '@/components/organisms/AddItemForm';
import ShoppingListBuilder from '@/components/organisms/ShoppingListBuilder';

export default function ShoppingListDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const { data: lists, isPending, isError } = useShoppingLists();
  const list = lists?.find((l) => l.id === id);

  if (!id) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-destructive">List not found.</span>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-muted">Loading…</span>
      </div>
    );
  }

  if (isError || !list) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-destructive">List not found.</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-4 py-4">
      <h1 className="font-display text-2xl font-bold text-text mb-4">{list.name}</h1>
      <AddItemForm listId={id} />
      <ShoppingListBuilder listId={id} />
    </div>
  );
}
