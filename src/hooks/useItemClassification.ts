import { useEffect, useMemo, useState } from 'react';
import { useItems, useItemLocations, useUpsertItemLocation } from '@/hooks/useItems';
import { useAisles } from '@/hooks/useAisles';
import { useActiveStore } from '@/hooks/useStores';
import { useAisleMatcher } from '@/hooks/useAisleMatcher';
import { buildAisleCandidates } from '@/lib/buildAisleCandidates';

export interface UseItemClassification {
  /** Begin model loading on a deliberate user signal (blur/submit); no-op on
   *  empty text. */
  prime: (rawValue: string) => void;
  /** Classify one item by name and write its location via the auto path, but
   *  only when it has no location at the active store (no-clobber). */
  classifyAndPlace: (itemId: string, name: string) => void;
  /** True while the matcher is loading and unlocated catalog items remain. */
  isClassifying: boolean;
}

/**
 * Owns the aisle-matcher lifecycle and per-store placement rules (ADR-0011 /
 * ADR-0013 / ADR-0015), keeping `AddItemForm` a thin presentational form.
 *
 * Guarantees preserved from the prior inline implementation:
 * - prime only on a deliberate user signal (blur/submit), never on mount;
 * - re-embed the worker on an active-store switch;
 * - the auto path never clobbers a manual location already set for a store.
 */
export function useItemClassification(): UseItemClassification {
  const { data: items } = useItems();
  const { data: activeStore } = useActiveStore();
  const { data: aisles } = useAisles(activeStore?.id);
  const { data: locations, isSuccess: locationsReady } = useItemLocations(activeStore?.id);
  const upsertLocation = useUpsertItemLocation();
  const [hasPrimed, setHasPrimed] = useState(false);

  // The matcher's candidate set is the active store's item→aisle map (joined
  // from item_locations) plus that store's aliases (ADR-0015). Empty until the
  // backing queries resolve so the matcher never primes against a partial set.
  const candidates = useMemo(() => {
    if (!items || !aisles || !locations) return [];
    return buildAisleCandidates(items, aisles, locations, activeStore?.slug);
  }, [items, aisles, locations, activeStore?.slug]);

  const { prime, classify, isReady } = useAisleMatcher(activeStore?.id, candidates);

  // Items located at the active store; an item missing here triggers classification.
  const locatedItemIds = useMemo(
    () => new Set((locations ?? []).map((l) => l.item_id)),
    [locations],
  );

  // Kick off model loading only on a deliberate user signal (blur or submit)
  // with non-empty text — never on mount, while typing, or in the empty state.
  function primeFromSignal(rawValue: string) {
    if (!rawValue.trim()) return;
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

  // Classify when the item has no location for the active store — true for a
  // freshly-created item and for an existing catalog item re-added at a store
  // where it isn't placed yet. The auto path never clobbers a manual location.
  function classifyAndPlace(itemId: string, name: string) {
    if (!isReady || !activeStore || locatedItemIds.has(itemId)) return;
    classify(name, aisles ?? []).then((aisleId) => {
      if (aisleId)
        upsertLocation.mutate({ itemId, storeId: activeStore.id, aisleId, auto: true });
    });
  }

  const isClassifying =
    hasPrimed && !isReady && (items ?? []).some((i) => !locatedItemIds.has(i.id));

  return { prime: primeFromSignal, classifyAndPlace, isClassifying };
}
