interface GroceryListItemProps {
  name: string;
  color: string;
  checked?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
}

export default function GroceryListItem({
  name,
  color,
  checked = false,
  onToggle,
  onDelete,
}: GroceryListItemProps) {
  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 ${onToggle ? 'cursor-pointer select-none' : ''}`}
      onClick={onToggle}
    >
      <span
        className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
        style={
          checked
            ? { backgroundColor: color }
            : { border: `2px solid ${color}` }
        }
      >
        {checked && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
            <path
              d="M1 4l3 3 5-6"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>

      <span
        className={`flex-1 font-medium text-text truncate ${checked ? 'line-through text-text-muted' : ''}`}
      >
        {name}
      </span>

      {onDelete && !checked && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="shrink-0 text-text-muted hover:text-text transition-colors"
          aria-label="Delete item"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M1 1l12 12M13 1L1 13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </li>
  );
}
