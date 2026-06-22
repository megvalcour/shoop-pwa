import { useRef, useState } from 'react';
import {
  useDefaultList,
  useAddDefaultListItem,
  useRemoveDefaultListItem,
} from '@/hooks/useDefaultList';
import { useItems } from '@/hooks/useItems';
import GroceryListItem from '@/components/molecules/GroceryListItem';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';
import type { Item } from '@/db/schema';

/**
 * Manages the store-agnostic default list (ADR-0009). Entries reference catalog
 * items only — no aisle data — so the editor is a flat add/remove list with no
 * per-store grouping or check-off. Aisle classification happens later, per-store,
 * when a default item is seeded into a real shopping list.
 */
export default function DefaultListEditor() {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: entries, isPending, isError } = useDefaultList();
  const { data: items } = useItems();
  const addItem = useAddDefaultListItem();
  const removeItem = useRemoveDefaultListItem();

  const itemById = new Map<string, Item>((items ?? []).map((item) => [item.id, item]));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    setValue('');
    inputRef.current?.focus();
    addItem.mutate(name);
  }

  function renderEntries() {
    if (isPending || !items) return <p className="text-text-muted">Loading…</p>;
    if (isError) return <p className="text-destructive">Failed to load default list.</p>;
    if (entries.length === 0) return <p className="text-text-muted mt-4">No default items yet.</p>;
    return (
      <ul className="mt-4 flex flex-col gap-2">
        {entries.map((entry) => (
          <GroceryListItem
            key={entry.id}
            name={itemById.get(entry.item_id)?.name ?? 'Unknown item'}
            quantity={entry.quantity}
            onDelete={() => removeItem.mutate(entry.id)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
        <label htmlFor="add-default-item-input" className="sr-only">
          Item name
        </label>
        <Input
          ref={inputRef}
          id="add-default-item-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a default item…"
          className="flex-1"
        />
        <Button type="submit" variant="primary" disabled={!value.trim()}>
          Add
        </Button>
      </form>
      {addItem.isError && (
        <p className="mt-1 text-xs text-destructive">Failed to add item. Please try again.</p>
      )}
      {renderEntries()}
    </div>
  );
}
