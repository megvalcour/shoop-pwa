import { useListItems, useDeleteListItem, useToggleListItem } from '@/hooks/useListItems';
import { useItems } from '@/hooks/useItems';
import GroceryListItem from '@/components/molecules/GroceryListItem';

interface ShoppingListBuilderProps {
  listId: string;
}

export default function ShoppingListBuilder({ listId }: ShoppingListBuilderProps) {
  const { data: listItems, isPending, isError } = useListItems(listId);
  const { data: items } = useItems();
  const deleteItem = useDeleteListItem();
  const toggleItem = useToggleListItem();

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

  const sorted = [...listItems].sort(
    (a, b) => Number(a.checked) - Number(b.checked) || (a.created_at ?? 0) - (b.created_at ?? 0),
  );

  return (
    <div className="mt-4">
      <ul className="flex flex-col gap-2">
        {sorted.map((li) => (
          <GroceryListItem
            key={li.id}
            name={nameById.get(li.item_id) ?? 'Unknown item'}
            quantity={li.quantity}
            checked={li.checked}
            onToggle={() => toggleItem.mutate({ id: li.id, listId })}
            onDelete={() => deleteItem.mutate({ id: li.id, listId })}
          />
        ))}
      </ul>
    </div>
  );
}
