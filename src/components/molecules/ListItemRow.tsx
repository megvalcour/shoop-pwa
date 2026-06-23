import { faTrash } from '@fortawesome/free-solid-svg-icons';
import Button from '@/components/atoms/Button';
import Icon from '@/components/atoms/Icon';

export interface ListItemRowProps {
  name: string;
  quantity: number;
  checked?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  badge?: React.ReactNode;
}

export default function ListItemRow({
  name,
  quantity,
  checked = false,
  onToggle,
  onDelete,
  badge,
}: ListItemRowProps) {
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
        <span className="text-sm text-text-muted">×{quantity}</span>
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
