import { faCheck, faTrash } from '@fortawesome/free-solid-svg-icons';
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
      className={`px-3 py-3 rounded-xl flex items-center justify-between motion-safe:transition-all motion-safe:duration-200 ${
        checked ? 'bg-tint/60 shadow-none' : 'bg-card shadow-card'
      } ${onToggle ? 'cursor-pointer select-none' : ''}`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {onToggle && (
          <span
            aria-hidden="true"
            className={`shrink-0 grid place-items-center h-5 w-5 rounded-full border-2 text-[10px] motion-safe:transition-colors ${
              checked
                ? 'bg-accent border-accent text-primary'
                : 'bg-card border-border text-transparent'
            }`}
          >
            <Icon icon={faCheck} />
          </span>
        )}
        <span
          className={`font-semibold truncate ${checked ? 'line-through text-text-muted' : 'text-text'}`}
        >
          {name}
        </span>
        {badge}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {onQuantityClick ? (
          <button
            type="button"
            className="text-sm font-bold tabular-nums text-text-muted underline decoration-dotted underline-offset-2"
            onClick={(e) => {
              e.stopPropagation();
              onQuantityClick();
            }}
            aria-label="Edit quantity"
          >
            {quantityText}
          </button>
        ) : (
          <span className="text-sm font-bold tabular-nums text-text-muted">{quantityText}</span>
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
