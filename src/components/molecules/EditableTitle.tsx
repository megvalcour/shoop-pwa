import { useState } from 'react';
import Input from '@/components/atoms/Input';

export interface EditableTitleProps {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  ariaLabel?: string;
}

export default function EditableTitle({
  value,
  onSave,
  className,
  ariaLabel = 'List name',
}: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const startEditing = () => {
    setDraft(value);
    setEditing(true);
  };

  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        aria-label={ariaLabel}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        className={className}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={`Rename: ${value}`}
      onClick={startEditing}
      className={className}
    >
      {value}
    </button>
  );
}
