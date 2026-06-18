import { useListItems, useDeleteListItem, useToggleListItem } from '@/hooks/useListItems';
import { useItems, useUpdateItemAisle } from '@/hooks/useItems';
import { useAisles } from '@/hooks/useAisles';
import GroceryListItem from '@/components/molecules/GroceryListItem';
import AisleGroup from '@/components/molecules/AisleGroup';
import type { Aisle, Item, ListItem } from '@/db/schema';

interface ShoppingListBuilderProps {
  listId: string;
}

interface AisleBucket {
  aisle: Aisle;
  listItems: ListItem[];
}

export default function ShoppingListBuilder({ listId }: ShoppingListBuilderProps) {
  const { data: listItems, isPending, isError } = useListItems(listId);
  const { data: items } = useItems();
  const { data: aisles } = useAisles();
  const deleteItem = useDeleteListItem();
  const toggleItem = useToggleListItem();
  const updateItemAisle = useUpdateItemAisle();

  const itemById = new Map<string, Item>((items ?? []).map((item) => [item.id, item]));
  const aisleById = new Map<string, Aisle>((aisles ?? []).map((a) => [a.id, a]));

  if (isPending || !items) {
    return <span className="text-text-muted">Loading…</span>;
  }

  if (isError) {
    return <span className="text-destructive">Failed to load items.</span>;
  }

  if (listItems.length === 0) {
    return <p className="text-text-muted mt-4">No items yet.</p>;
  }

  const unchecked = listItems.filter((li) => !li.checked);
  const checked = listItems.filter((li) => li.checked);

  // Group unchecked by aisle
  const bucketMap = new Map<string, ListItem[]>();
  const uncategorized: ListItem[] = [];

  for (const li of unchecked) {
    const item = itemById.get(li.item_id);
    const aisleId = item?.aisle_id ?? '';
    if (!aisleId || !aisleById.has(aisleId)) {
      uncategorized.push(li);
    } else {
      const bucket = bucketMap.get(aisleId);
      if (bucket) {
        bucket.push(li);
      } else {
        bucketMap.set(aisleId, [li]);
      }
    }
  }

  // Sort aisle buckets by sort_order
  const sortedBuckets: AisleBucket[] = [...bucketMap.entries()]
    .map(([aisleId, lis]) => ({ aisle: aisleById.get(aisleId)!, listItems: lis }))
    .sort((a, b) => a.aisle.sort_order - b.aisle.sort_order);

  function renderListItem(li: ListItem) {
    const item = itemById.get(li.item_id);
    const aisleId = item?.aisle_id ?? '';
    const aisle = aisleById.get(aisleId);
    const isAnalyzing = !li.checked && (!aisleId || !aisleById.has(aisleId));

    return (
      <GroceryListItem
        key={li.id}
        name={item?.name ?? 'Unknown item'}
        quantity={li.quantity}
        checked={li.checked}
        onToggle={() => toggleItem.mutate({ id: li.id, listId })}
        onDelete={() => deleteItem.mutate({ id: li.id, listId })}
        aisleLabel={aisle?.label}
        isAnalyzing={isAnalyzing}
        aisles={aisles}
        currentAisleId={aisleId}
        onAisleChange={(newAisleId) =>
          updateItemAisle.mutate({ itemId: li.item_id, aisleId: newAisleId })
        }
      />
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {sortedBuckets.map(({ aisle, listItems: lis }) => (
        <AisleGroup key={aisle.id} label={aisle.label} number={aisle.number}>
          {lis.map(renderListItem)}
        </AisleGroup>
      ))}

      {uncategorized.length > 0 && (
        <AisleGroup label="Uncategorized" isSpecial>
          {uncategorized.map(renderListItem)}
        </AisleGroup>
      )}

      {checked.length > 0 && (
        <AisleGroup label="Done" isSpecial>
          {checked.map(renderListItem)}
        </AisleGroup>
      )}
    </div>
  );
}
