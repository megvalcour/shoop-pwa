import {
  useListItems,
  useDeleteListItem,
  useToggleListItem,
  useUpdateListItem,
} from '@/hooks/useListItems';
import { useItems, useItemLocations, useUpsertItemLocation } from '@/hooks/useItems';
import { useAisles } from '@/hooks/useAisles';
import { useActiveStore } from '@/hooks/useStores';
import GroceryListItem from '@/components/molecules/GroceryListItem';
import AisleGroup from '@/components/molecules/AisleGroup';
import { groupListItemsByAisle } from '@/lib/groupListItemsByAisle';
import { formatAisleLabel } from '@/lib/formatAisleLabel';
import { useCategorizationStore } from '@/stores/useCategorizationStore';
import type { Aisle, Item, ListItem } from '@/db/schema';

interface ShoppingListBuilderProps {
  listId: string;
}

export default function ShoppingListBuilder({ listId }: ShoppingListBuilderProps) {
  const { data: listItems, isPending, isError } = useListItems(listId);
  const { data: items } = useItems();
  const { data: activeStore } = useActiveStore();
  const { data: aisles } = useAisles(activeStore?.id);
  const { data: locations } = useItemLocations(activeStore?.id);
  const deleteItem = useDeleteListItem();
  const toggleItem = useToggleListItem();
  const updateItem = useUpdateListItem();
  const upsertLocation = useUpsertItemLocation();
  const categorizingIds = useCategorizationStore((s) => s.categorizingIds);
  const status = useCategorizationStore((s) => s.status);

  const itemById = new Map<string, Item>((items ?? []).map((item) => [item.id, item]));
  const aisleById = new Map<string, Aisle>((aisles ?? []).map((a) => [a.id, a]));
  // item_id → aisle_id for the active store (ADR-0015). Lists are store-agnostic;
  // the aisle each list item buckets into is resolved per-store here.
  const aisleByItem = new Map<string, string>(
    (locations ?? []).map((l) => [l.item_id, l.aisle_id]),
  );

  if (isPending || !items) {
    return <span className="text-text-muted">Loading…</span>;
  }

  if (isError) {
    return <span className="text-destructive">Failed to load items.</span>;
  }

  if (listItems.length === 0) {
    return <p className="text-text-muted mt-4">No items yet.</p>;
  }

  const { buckets, categorizing, uncategorized, checked } = groupListItemsByAisle(listItems, {
    aisleById,
    aisleByItem,
    categorizingIds,
    status,
  });

  function renderListItem(li: ListItem, isCategorizing = false) {
    const item = itemById.get(li.item_id);
    const aisleId = aisleByItem.get(li.item_id) ?? '';
    const aisle = aisleById.get(aisleId);

    return (
      <GroceryListItem
        key={li.id}
        name={item?.name ?? 'Unknown item'}
        quantity={li.quantity}
        unit={li.unit}
        checked={li.checked}
        onToggle={() => toggleItem.mutate({ id: li.id, listId })}
        onDelete={() => deleteItem.mutate({ id: li.id, listId })}
        onQuantityChange={(quantity, unit) =>
          updateItem.mutate({ id: li.id, listId, quantity, unit })
        }
        aisleLabel={aisle?.label}
        isCategorizing={isCategorizing}
        aisles={aisles}
        currentAisleId={aisleId}
        onAisleChange={(newAisleId) => {
          if (activeStore)
            upsertLocation.mutate({
              itemId: li.item_id,
              storeId: activeStore.id,
              aisleId: newAisleId,
            });
        }}
      />
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      {categorizing.length > 0 && (
        <AisleGroup header="Categorizing…" variant="muted">
          {categorizing.map((li) => renderListItem(li, true))}
        </AisleGroup>
      )}

      {buckets.map(({ aisle, listItems: lis }) => {
        const isNumeric = /^\d+$/.test(aisle.number ?? '');
        return (
          <AisleGroup
            key={aisle.id}
            marker={isNumeric ? aisle.number : undefined}
            header={isNumeric ? aisle.label : formatAisleLabel(aisle)}
          >
            {lis.map((li) => renderListItem(li))}
          </AisleGroup>
        );
      })}

      {uncategorized.length > 0 && (
        <AisleGroup header="Uncategorized" variant="muted">
          {uncategorized.map((li) => renderListItem(li))}
        </AisleGroup>
      )}

      {checked.length > 0 && (
        <AisleGroup header={`Done · ${checked.length}`} variant="done">
          {checked.map((li) => renderListItem(li))}
        </AisleGroup>
      )}
    </div>
  );
}
