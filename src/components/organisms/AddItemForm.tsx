import { useState } from 'react';
import { useAddListItem } from '@/hooks/useListItems';

interface AddItemFormProps {
  listId: string;
}

export default function AddItemForm({ listId }: AddItemFormProps) {
  const [value, setValue] = useState('');
  const { mutate, isPending } = useAddListItem();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    mutate(
      { listId, name: value },
      { onSuccess: () => setValue('') },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-4">
      <label htmlFor="add-item-input" className="sr-only">
        Item name
      </label>
      <input
        id="add-item-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
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
  );
}
