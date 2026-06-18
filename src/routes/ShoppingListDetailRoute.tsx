import { useParams } from 'react-router';
import { useShoppingLists } from '@/hooks/useShoppingLists';
import { useListItems } from '@/hooks/useListItems';
import { useItems } from '@/hooks/useItems';
import AddItemForm from '@/components/organisms/AddItemForm';
import GroceryListItem from '@/components/molecules/GroceryListItem';

export default function ShoppingListDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const { data: lists, isPending, isError } = useShoppingLists();
  const { data: listItems } = useListItems(id ?? '');
  const { data: items } = useItems();
  const list = lists?.find((l) => l.id === id);

  // Finding 7: explicit guard before any use of id so the ! assertion below is unnecessary
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

  const nameById = new Map((items ?? []).map((item) => [item.id, item.name]));

  return (
    <div className="flex flex-col px-4 py-4">
      <h1 className="font-display text-2xl font-bold text-text mb-4">{list.name}</h1>
      <AddItemForm listId={id} />
      {listItems && listItems.length > 0 ? (
        <ul className="flex flex-col gap-2 mt-4">
          {listItems.map((li) => (
            <GroceryListItem
              key={li.id}
              name={nameById.get(li.item_id) ?? 'Unknown item'}
              quantity={li.quantity}
            />
          ))}
        </ul>
      ) : (
        <p className="text-text-muted mt-4">No items yet.</p>
      )}
    </div>
  );
}
