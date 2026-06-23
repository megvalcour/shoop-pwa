import { useState, useRef } from 'react';
import { useAddListItem } from '@/hooks/useListItems';
import { useItemClassification } from '@/hooks/useItemClassification';
import ItemEntryForm from '@/components/molecules/ItemEntryForm';

interface AddItemFormProps {
  listId: string;
}

export default function AddItemForm({ listId }: AddItemFormProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate } = useAddListItem();
  const { prime, classifyAndPlace } = useItemClassification();

  function handleSubmit() {
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
      <ItemEntryForm
        value={value}
        onChange={setValue}
        onSubmit={handleSubmit}
        onBlur={() => prime(value)}
        placeholder="Add an item…"
        inputId="add-item-input"
        inputRef={inputRef}
      />
    </div>
  );
}
