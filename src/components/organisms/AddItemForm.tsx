import { useState, useRef } from 'react';
import { useAddListItem } from '@/hooks/useListItems';
import { useItemClassification } from '@/hooks/useItemClassification';
import Button from '@/components/atoms/Button';
import Input from '@/components/atoms/Input';

interface AddItemFormProps {
  listId: string;
}

export default function AddItemForm({ listId }: AddItemFormProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate } = useAddListItem();
  const { prime, classifyAndPlace, isClassifying } = useItemClassification();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    prime(name);
    // Clear and refocus immediately so back-to-back entry is never gated on the
    // mutation/refetch, and an Add-button tap returns the caret to the input.
    setValue('');
    inputRef.current?.focus();
    mutate(
      { listId, name },
      {
        onSuccess: (result) => {
          if (result.newItemId) classifyAndPlace(result.newItemId, name);
        },
      },
    );
  }

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
          onBlur={() => prime(value)}
          placeholder="Add an item…"
          className="flex-1"
        />
        <Button type="submit" variant="primary" disabled={!value.trim()}>
          Add
        </Button>
      </form>
      {isClassifying && (
        <p className="mt-1 text-xs text-text-muted animate-pulse">Classifying…</p>
      )}
    </div>
  );
}
