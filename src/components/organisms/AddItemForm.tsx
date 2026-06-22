import { useState, useEffect, useRef, useMemo } from 'react';
import { useAddListItem } from '@/hooks/useListItems';
import { useItems, useItemLocations, useUpsertItemLocation } from '@/hooks/useItems';
import { useAisles } from '@/hooks/useAisles';
import { useActiveStore } from '@/hooks/useStores';
import { useAisleMatcher } from '@/hooks/useAisleMatcher';
import { buildCandidates } from '@/services/classifier';
import { aliasesForSlug } from '@/services/aisleAliases';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';

interface AddItemFormProps {
  listId: string;
}

export default function AddItemForm({ listId }: AddItemFormProps) {
  const [value, setValue] = useState('');
  const { mutate } = useAddListItem();
  const { data: items } = useItems();
  const { data: activeStore } = useActiveStore();
  const { data: aisles } = useAisles(activeStore?.id);
  const { data: locations, isSuccess: locationsReady } = useItemLocations(activeStore?.id);
  const upsertLocation = useUpsertItemLocation();
  const [hasPrimed, setHasPrimed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // The matcher's candidate set is the active store's item→aisle map (joined
  // from item_locations) plus that store's aliases (ADR-0015).
  const candidates = useMemo(() => {
    if (!items || !aisles || !locations) return [];
    const canonicalById = new Map(items.map((i) => [i.id, i.canonical_name]));
    const catalogInput = locations
      .map((loc) => ({
        canonical_name: canonicalById.get(loc.item_id) ?? '',
        aisle_id: loc.aisle_id,
      }))
      .filter((c) => c.canonical_name);
    const aisleById = new Map(aisles.map((a) => [a.id, a.number]));
    return buildCandidates(catalogInput, aliasesForSlug(activeStore?.slug), aisleById);
  }, [items, aisles, locations, activeStore?.slug]);

  const { prime, classify, isReady } = useAisleMatcher(activeStore?.id, candidates);

  // Items located at the active store; an item missing here triggers classification.
  const locatedItemIds = useMemo(
    () => new Set((locations ?? []).map((l) => l.item_id)),
    [locations],
  );

  // Kick off model loading only on a deliberate user signal (blur or submit) with
  // non-empty text — never on mount, while typing, or in the empty state.
  function primeMatcher() {
    if (!value.trim()) return;
    setHasPrimed(true);
    prime();
  }

  // Once primed, keep the worker embedded for the active store. prime() re-embeds
  // only when the store actually changed, so this is a no-op on most renders but
  // remaps the candidate set on a store switch.
  useEffect(() => {
    if (hasPrimed) prime();
  }, [hasPrimed, prime]);

  // When the model becomes ready (or the active store changes), classify any
  // catalog item lacking a location for the active store — the re-aisle premise:
  // a re-added existing item with no location at the new store must classify
  // there too. The write goes through the auto path, so an existing manual
  // location for that store is never overwritten.
  const itemsReady = !!items;
  useEffect(() => {
    if (!isReady || !activeStore || !itemsReady || !locationsReady) return;
    const located = new Set((locations ?? []).map((l) => l.item_id));
    const unlocated = (items ?? []).filter((item) => !located.has(item.id));
    if (unlocated.length === 0) return;
    for (const item of unlocated) {
      classify(item.name, aisles ?? []).then((aisleId) => {
        if (aisleId)
          upsertLocation.mutate({ itemId: item.id, storeId: activeStore.id, aisleId, auto: true });
      });
    }
    // Fire only when readiness or the active store flips — not on every items /
    // locations change — to avoid classify → invalidate → re-classify loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeStore?.id, itemsReady, locationsReady]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    primeMatcher();
    // Clear and refocus immediately so back-to-back entry is never gated on the
    // mutation/refetch, and an Add-button tap returns the caret to the input.
    setValue('');
    inputRef.current?.focus();
    mutate(
      { listId, name },
      {
        onSuccess: (result) => {
          // Classify when the item has no location for the active store — true for
          // a freshly-created item and for an existing catalog item re-added at a
          // store where it isn't placed yet. The auto path never clobbers a manual
          // location already set for this store.
          if (isReady && result.newItemId && activeStore && !locatedItemIds.has(result.newItemId)) {
            const newItemId = result.newItemId;
            classify(name, aisles ?? []).then((aisleId) => {
              if (aisleId)
                upsertLocation.mutate({
                  itemId: newItemId,
                  storeId: activeStore.id,
                  aisleId,
                  auto: true,
                });
            });
          }
        },
      },
    );
  }

  const showClassifying =
    hasPrimed && !isReady && (items ?? []).some((i) => !locatedItemIds.has(i.id));

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
        <label htmlFor="add-item-input" className="sr-only">
          Item name
        </label>
        <Input
          ref={inputRef}
          id="add-item-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={primeMatcher}
          placeholder="Add an item…"
          className="flex-1"
        />
        <Button type="submit" variant="primary" disabled={!value.trim()}>
          Add
        </Button>
      </form>
      {showClassifying && (
        <p className="mt-1 text-xs text-text-muted animate-pulse">Classifying…</p>
      )}
    </div>
  );
}
