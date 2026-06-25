import { faTrash } from '@fortawesome/free-solid-svg-icons';
import Button from '@/components/atoms/Button';
import Icon from '@/components/atoms/Icon';
import { formatQuantity } from '@/lib/formatQuantity';

export interface ListItemRowProps {
  name: string;
  quantity: number;
  unit?: string;
  checked?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  /** When set, the quantity becomes a tappable control that opens an editor. */
  onQuantityClick?: () => void;
  badge?: React.ReactNode;
}

export default function ListItemRow({
  name,
  quantity,
  unit,
  checked = false,
  onToggle,
  onDelete,
  onQuantityClick,
  badge,
}: ListItemRowProps) {
  const quantityText = formatQuantity(quantity, unit);
  return (
    <li
      className={`px-4 py-3 bg-card rounded-lg shadow-sm flex items-center justify-between ${onToggle ? 'cursor-pointer select-none' : ''} ${checked ? 'opacity-60' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`font-medium text-text truncate ${checked ? 'line-through' : ''}`}>
          {name}
        </span>
        {badge}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {onQuantityClick ? (
          <button
            type="button"
            className="text-sm text-text-muted underline decoration-dotted underline-offset-2"
            onClick={(e) => {
              e.stopPropagation();
              onQuantityClick();
            }}
            aria-label="Edit quantity"
          >
            {quantityText}
          </button>
        ) : (
          <span className="text-sm text-text-muted">{quantityText}</span>
        )}
        {onDelete && (
          <Button
            variant="danger"
            shape="icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete item"
          >
            <Icon icon={faTrash} />
          </Button>
        )}
      </div>
    </li>
  );
}
