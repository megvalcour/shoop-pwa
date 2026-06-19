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

  const showClassifying = hasPrimed && !isReady && (items ?? []).some((i) => i.aisle_id === '');

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div
          style={{
            boxShadow: '0 8px 24px -8px rgba(8,72,135,.4)',
            border: '1px solid #eaeef6',
            borderRadius: 16,
            backgroundColor: '#ffffff',
          }}
          className="flex items-center gap-3 px-4 py-3"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              d="M10 4v12M4 10h12"
              stroke="#084887"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
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
            disabled={isPending}
            className="flex-1 bg-transparent text-text placeholder:text-text-muted focus:outline-none text-base"
          />
        </div>
      </form>
      {showClassifying && (
        <p className="mt-1 text-xs text-text-muted animate-pulse">Classifying…</p>
      )}
    </div>
  );
}
