import { useParams } from 'react-router';
import { useShoppingLists, useRenameShoppingList } from '@/hooks/useShoppingLists';
import EditableTitle from '@/components/molecules/EditableTitle';
import AddItemForm from '@/components/organisms/AddItemForm';
import ShoppingListBuilder from '@/components/organisms/ShoppingListBuilder';

export default function ShoppingListDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const { data: lists, isPending, isError } = useShoppingLists();
  const renameList = useRenameShoppingList();
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
      <EditableTitle
        value={list.name}
        onSave={(name) => renameList.mutate({ id, name })}
        className="font-body text-base font-medium text-text-muted text-left"
      />
      <AddItemForm listId={id} />
      <ShoppingListBuilder listId={id} />
    </div>
  );
}
