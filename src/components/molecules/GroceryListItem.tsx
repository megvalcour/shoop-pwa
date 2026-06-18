import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';

interface GroceryListItemProps {
  name: string;
  quantity: number;
  onDelete?: () => void;
}

export default function GroceryListItem({ name, quantity, onDelete }: GroceryListItemProps) {
  return (
    <li className="px-4 py-3 bg-white rounded-lg shadow-sm flex items-center justify-between">
      <span className="font-medium text-text">{name}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-text-muted">×{quantity}</span>
        {onDelete && (
          <button
            onClick={onDelete}
            aria-label="Delete item"
            className="p-1 text-destructive"
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        )}
      </div>
    </li>
  );
}
