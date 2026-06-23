import { useEffect, useMemo, useRef, useState } from 'react';
import { useItems, useItemLocations, useUpsertItemLocation } from '@/hooks/useItems';
import { useAisles } from '@/hooks/useAisles';
import { useActiveStore } from '@/hooks/useStores';
import { useAisleMatcher } from '@/hooks/useAisleMatcher';
import { buildAisleCandidates } from '@/lib/buildAisleCandidates';
import { useCategorizationStore } from '@/stores/useCategorizationStore';

export interface UseItemClassification {
  /** Begin model loading on a deliberate user signal (blur/submit); no-op on
   *  empty text. */
  prime: (rawValue: string) => void;
  /** Classify one item by name and write its location via the auto path, but
   *  only when it has no location at the active store (no-clobber). */
  classifyAndPlace: (itemId: string, name: string) => void;
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

  // Select store actions (not the set) so this hook doesn't re-render on every
  // begin/end/setStatus from other parts of the tree.
  const begin = useCategorizationStore((s) => s.begin);
  const end = useCategorizationStore((s) => s.end);
  const setStatus = useCategorizationStore((s) => s.setStatus);
  const reset = useCategorizationStore((s) => s.reset);

  // The matcher's candidate set is the active store's item→aisle map (joined
  // from item_locations) plus that store's aliases (ADR-0015). Empty until the
  // backing queries resolve so the matcher never primes against a partial set.
  const candidates = useMemo(() => {
    if (!items || !aisles || !locations) return [];
    return buildAisleCandidates(items, aisles, locations, activeStore?.slug);
  }, [items, aisles, locations, activeStore?.slug]);

  const { prime, classify, isReady, status } = useAisleMatcher(activeStore?.id, candidates);

  // Items located at the active store; an item missing here triggers classification.
  const locatedItemIds = useMemo(
    () => new Set((locations ?? []).map((l) => l.item_id)),
    [locations],
  );

  // Publish the matcher lifecycle so the sibling ShoppingListBuilder can tell
  // "actively categorizing" apart from "settled-uncategorized".
  useEffect(() => {
    setStatus(status);
  }, [status, setStatus]);

  // A store switch re-enters loading for the new store; drop ids that belonged
  // to the old store so its in-flight spinners don't leak across.
  useEffect(() => {
    reset();
  }, [activeStore?.id, reset]);

  // On `failed` (worker error or readiness timeout), settle everything so the
  // affected items drop to Uncategorized rather than spin forever (the grouping
  // rule keeps `status: 'loading'` items in Categorizing; `failed` does not).
  useEffect(() => {
    if (status === 'failed') reset();
  }, [status, reset]);

  // Track ids this hook claimed so unmount can release them (no orphan spinners
  // when navigating away mid-classify).
  const trackedIds = useRef<Set<string>>(new Set());
  function beginTracked(itemId: string) {
    trackedIds.current.add(itemId);
    begin(itemId);
  }
  function endTracked(itemId: string) {
    trackedIds.current.delete(itemId);
    end(itemId);
  }
  useEffect(() => {
    const tracked = trackedIds.current;
    return () => {
      for (const id of tracked) end(id);
      tracked.clear();
    };
  }, [end]);

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
      beginTracked(item.id);
      classify(item.name, aisles ?? [])
        .then((aisleId) => {
          if (aisleId)
            upsertLocation.mutate({ itemId: item.id, storeId: activeStore.id, aisleId, auto: true });
        })
        .finally(() => endTracked(item.id));
    }
    // Fire only when readiness or the active store flips — not on every items /
    // locations change — to avoid classify → invalidate → re-classify loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, activeStore?.id, itemsReady, locationsReady]);

  // Classify when the item has no location for the active store — true for a
  // freshly-created item and for an existing catalog item re-added at a store
  // where it isn't placed yet. The auto path never clobbers a manual location.
  function classifyAndPlace(itemId: string, name: string) {
    if (!activeStore || locatedItemIds.has(itemId)) return;
    // Only claim "categorizing" if the matcher can actually run now. If it's
    // still loading, mark the item categorizing for the load window — the
    // deferred reclassify effect claims+releases it once ready; if the matcher
    // never readies, status:'failed' resets the set (effect above).
    if (!isReady) {
      if (status === 'loading') beginTracked(itemId);
      return;
    }
    beginTracked(itemId);
    classify(name, aisles ?? [])
      .then((aisleId) => {
        if (aisleId)
          upsertLocation.mutate({ itemId, storeId: activeStore.id, aisleId, auto: true });
      })
      .finally(() => endTracked(itemId));
  }

  return { prime: primeFromSignal, classifyAndPlace };
}
