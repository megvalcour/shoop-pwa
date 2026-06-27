import { useRef, useState } from 'react';
import {
  useDefaultList,
  useAddDefaultListItem,
  useRemoveDefaultListItem,
  useUpdateDefaultListItem,
} from '@/hooks/useDefaultList';
import { useItems } from '@/hooks/useItems';
import ListItemRow from '@/components/molecules/ListItemRow';
import QuantitySheet from '@/components/molecules/QuantitySheet';
import ItemEntryForm from '@/components/molecules/ItemEntryForm';
import type { DefaultListEntry, Item } from '@/db/schema';

/**
 * Manages the store-agnostic default list (ADR-0009). Entries reference catalog
 * items only — no aisle data — so the editor is a flat add/remove list with no
 * per-store grouping or check-off. Aisle classification happens later, per-store,
 * when a default item is seeded into a real shopping list.
 */
export default function DefaultListEditor() {
  const [value, setValue] = useState('');
  const [editing, setEditing] = useState<DefaultListEntry | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: entries, isPending, isError } = useDefaultList();
  const { data: items } = useItems();
  const addItem = useAddDefaultListItem();
  const removeItem = useRemoveDefaultListItem();
  const updateItem = useUpdateDefaultListItem();

  const itemById = new Map<string, Item>((items ?? []).map((item) => [item.id, item]));

  function handleSubmit() {
    const name = value.trim();
    if (!name) return;
    setValue('');
    inputRef.current?.focus();
    addItem.mutate({ name });
  }

  function renderEntries() {
    if (isPending || !items) return <p className="text-text-muted">Loading…</p>;
    if (isError) return <p className="text-destructive">Failed to load default list.</p>;
    if (entries.length === 0) return <p className="text-text-muted mt-4">No default items yet.</p>;
    return (
      <ul className="mt-4 flex flex-col gap-2">
        {entries.map((entry) => (
          <ListItemRow
            key={entry.id}
            name={itemById.get(entry.item_id)?.name ?? 'Unknown item'}
            quantity={entry.quantity}
            unit={entry.unit}
            onDelete={() => removeItem.mutate(entry.id)}
            onQuantityClick={() => setEditing(entry)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div>
      <ItemEntryForm
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        placeholder="Add a default item…"
        inputId="add-default-item-input"
        inputRef={inputRef}
      />
      {addItem.isError && (
        <p className="mt-1 text-xs text-destructive">Failed to add item. Please try again.</p>
      )}
      {renderEntries()}
      {editing && (
        <QuantitySheet
          quantity={editing.quantity}
          unit={editing.unit}
          onSave={(quantity, unit) => updateItem.mutate({ id: editing.id, quantity, unit })}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
