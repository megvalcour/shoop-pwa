import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { Aisle } from '@/db/schema';
import AislePickerSheet from '@/components/molecules/AislePickerSheet';

interface GroceryListItemProps {
  name: string;
  quantity: number;
  checked?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  aisleLabel?: string;
  isAnalyzing?: boolean;
  aisles?: Aisle[];
  currentAisleId?: string;
  onAisleChange?: (aisleId: string) => void;
}

export default function GroceryListItem({
  name,
  quantity,
  checked = false,
  onToggle,
  onDelete,
  aisleLabel,
  isAnalyzing = false,
  aisles,
  currentAisleId = '',
  onAisleChange,
}: GroceryListItemProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <li
        className={`px-4 py-3 bg-card rounded-lg shadow-sm flex items-center justify-between ${onToggle ? 'cursor-pointer select-none' : ''} ${checked ? 'opacity-60' : ''}`}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`font-medium text-text truncate ${checked ? 'line-through' : ''}`}>
            {name}
          </span>
          {isAnalyzing && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-xs bg-surface text-text-muted animate-pulse">
              …
            </span>
          )}
          {!isAnalyzing && aisleLabel && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSheetOpen(true);
              }}
              className="shrink-0 rounded px-1.5 py-0.5 text-xs bg-primary/10 text-primary"
              aria-label={`Change aisle: ${aisleLabel}`}
            >
              {aisleLabel}
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-text-muted">×{quantity}</span>
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete item"
              className="p-1 text-destructive"
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          )}
        </div>
      </li>
      {sheetOpen && aisles && onAisleChange && (
        <AislePickerSheet
          aisles={aisles}
          currentAisleId={currentAisleId}
          onSelect={onAisleChange}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
