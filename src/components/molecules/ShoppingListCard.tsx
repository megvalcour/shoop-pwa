import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { ShoppingList } from '@/db/schema';
import Button from '@/components/atoms/Button';

interface ShoppingListCardProps {
  list: ShoppingList;
  onClick: () => void;
  onDelete?: () => void;
}

export default function ShoppingListCard({ list, onClick, onDelete }: ShoppingListCardProps) {
  const formatted = new Date(list.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="w-full px-4 py-3 bg-card rounded-lg shadow-sm flex items-center justify-between">
      <button
        type="button"
        onClick={onClick}
        aria-label={list.name}
        className="flex-1 min-w-0 text-left flex flex-col gap-0.5 active:opacity-70"
      >
        <span className="font-medium text-text truncate">{list.name}</span>
        <span className="text-sm text-text-muted">{formatted}</span>
      </button>
      {onDelete && (
        <Button
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete list: ${list.name}`}
          className="shrink-0 ml-3"
        >
          <FontAwesomeIcon icon={faTrash} />
        </Button>
      )}
    </div>
  );
}
