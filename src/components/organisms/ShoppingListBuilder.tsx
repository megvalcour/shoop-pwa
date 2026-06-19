import { useListItems, useDeleteListItem, useToggleListItem } from '@/hooks/useListItems';
import { useItems } from '@/hooks/useItems';
import { useAisles } from '@/hooks/useAisles';
import { aisleColorFor } from '@/utils/aisleColor';
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
  const checked = listItems
    .filter((li) => li.checked)
    .sort((a, b) => {
      const aisleA = aisleById.get(itemById.get(a.item_id)?.aisle_id ?? '');
      const aisleB = aisleById.get(itemById.get(b.item_id)?.aisle_id ?? '');
      return (aisleA?.sort_order ?? Infinity) - (aisleB?.sort_order ?? Infinity);
    });

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

  function renderListItem(li: ListItem, color: string) {
    const item = itemById.get(li.item_id);
    return (
      <GroceryListItem
        key={li.id}
        name={item?.name ?? 'Unknown item'}
        color={color}
        checked={li.checked}
        onToggle={() => toggleItem.mutate({ id: li.id, listId })}
        onDelete={() => deleteItem.mutate({ id: li.id, listId })}
      />
    );
  }

  const fallbackColor = aisleColorFor('');

  return (
    <div className="flex flex-col gap-4">
      {sortedBuckets.map(({ aisle, listItems: lis }) => {
        const { color, tint } = aisleColorFor(aisle.label);
        return (
          <AisleGroup
            key={aisle.id}
            label={aisle.label}
            number={aisle.number}
            color={color}
            tint={tint}
            count={lis.length}
          >
            {lis.map((li) => renderListItem(li, color))}
          </AisleGroup>
        );
      })}

      {uncategorized.length > 0 && (
        <AisleGroup
          label="Uncategorized"
          color={fallbackColor.color}
          tint={fallbackColor.tint}
          count={uncategorized.length}
        >
          {uncategorized.map((li) => renderListItem(li, fallbackColor.color))}
        </AisleGroup>
      )}

      {checked.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-text-muted mb-2">
            Got it · {checked.length}
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#eef1f6' }}>
            {checked.map((li) => {
              const item = itemById.get(li.item_id);
              const aisle = aisleById.get(item?.aisle_id ?? '');
              const { color } = aisleColorFor(aisle?.label ?? '');
              return (
                <GroceryListItem
                  key={li.id}
                  name={item?.name ?? 'Unknown item'}
                  color={color}
                  checked={true}
                  onToggle={() => toggleItem.mutate({ id: li.id, listId })}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
