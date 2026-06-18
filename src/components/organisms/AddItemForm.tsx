import { useState, useEffect } from 'react';
import { useAddListItem } from '@/hooks/useListItems';
import { useItems, useUpdateItemAisle } from '@/hooks/useItems';
import { useAisles } from '@/hooks/useAisles';
import { useAisleMatcher } from '@/hooks/useAisleMatcher';

interface AddItemFormProps {
  listId: string;
}

export default function AddItemForm({ listId }: AddItemFormProps) {
  const [value, setValue] = useState('');
  const { mutate, isPending } = useAddListItem();
  const { data: items } = useItems();
  const { data: aisles } = useAisles();
  const updateItemAisle = useUpdateItemAisle();
  const { prime, classify, isReady } = useAisleMatcher();
  const [hasPrimed, setHasPrimed] = useState(false);

  // Kick off model loading only on a deliberate user signal (blur or submit) with
  // non-empty text — never on mount, while typing, or in the empty state.
  function primeMatcher() {
    if (!value.trim()) return;
    setHasPrimed(true);
    prime();
  }

  // When the model becomes ready, classify any items that were added while it was loading.
  useEffect(() => {
    if (!isReady) return;
    const unclassified = (items ?? []).filter((item) => item.aisle_id === '');
    if (unclassified.length === 0) return;
    for (const item of unclassified) {
      classify(item.name, aisles ?? []).then((aisleId) => {
        if (aisleId) updateItemAisle.mutate({ itemId: item.id, aisleId });
      });
    }
    // Intentionally omit classify/items/aisles/updateItemAisle — this effect must only
    // fire once when isReady transitions to true; running it on every items change
    // would create classify → invalidate → re-classify loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    primeMatcher();
    const name = value;
    mutate(
      { listId, name },
      {
        onSuccess: (result) => {
          setValue('');
          if (isReady && result.newItemId) {
            classify(name, aisles ?? []).then((aisleId) => {
              if (aisleId) updateItemAisle.mutate({ itemId: result.newItemId, aisleId });
            });
          }
        },
      },
    );
  }

  const showClassifying =
    hasPrimed && !isReady && (items ?? []).some((i) => i.aisle_id === '');

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
        <label htmlFor="add-item-input" className="sr-only">
          Item name
        </label>
        <input
          id="add-item-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={primeMatcher}
          placeholder="Add an item…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending || !value.trim()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {showClassifying && (
        <p className="mt-1 text-xs text-text-muted animate-pulse">Classifying…</p>
      )}
    </div>
  );
}
