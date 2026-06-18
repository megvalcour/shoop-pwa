import { useListItems, useDeleteListItem } from '@/hooks/useListItems';
import { useItems } from '@/hooks/useItems';
import GroceryListItem from '@/components/molecules/GroceryListItem';

interface ShoppingListBuilderProps {
  listId: string;
}

export default function ShoppingListBuilder({ listId }: ShoppingListBuilderProps) {
  const { data: listItems, isPending, isError } = useListItems(listId);
  const { data: items } = useItems();
  const deleteItem = useDeleteListItem();

  const nameById = new Map((items ?? []).map((item) => [item.id, item.name]));

  if (isPending || !items) {
    return <span className="text-text-muted">Loading…</span>;
  }

  if (isError) {
    return <span className="text-destructive">Failed to load items.</span>;
  }

  if (listItems.length === 0) {
    return <p className="text-text-muted mt-4">No items yet.</p>;
  }

  return (
    <div className="mt-4">
      <ul className="flex flex-col gap-2">
        {listItems.map((li) => (
          <GroceryListItem
            key={li.id}
            name={nameById.get(li.item_id) ?? 'Unknown item'}
            quantity={li.quantity}
            onDelete={() => deleteItem.mutate({ id: li.id, listId })}
          />
        ))}
      </ul>
    </div>
  );
}
