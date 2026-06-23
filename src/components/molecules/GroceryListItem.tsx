import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { Aisle } from '@/db/schema';
import AislePickerSheet from '@/components/molecules/AislePickerSheet';
import Button from '@/components/atoms/Button';
import Badge from '@/components/atoms/Badge';

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

  // The aisle badge is tappable for unchecked items as long as the picker is
  // wired up — this includes uncategorized items still showing the "…" badge.
  const canPickAisle = !checked && Boolean(aisles) && Boolean(onAisleChange);

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
          {isAnalyzing &&
            (canPickAisle ? (
              <Badge
                variant="muted"
                className="animate-pulse px-2.5 py-1 leading-none"
                onClick={(e) => {
                  e.stopPropagation();
                  setSheetOpen(true);
                }}
                aria-label="Categorize item"
              >
                …
              </Badge>
            ) : (
              <Badge variant="muted" className="animate-pulse">
                …
              </Badge>
            ))}
          {!isAnalyzing && aisleLabel && (
            <Badge
              className="px-2.5 py-1"
              onClick={(e) => {
                e.stopPropagation();
                setSheetOpen(true);
              }}
              aria-label={`Change aisle: ${aisleLabel}`}
            >
              {aisleLabel}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-text-muted">×{quantity}</span>
          {onDelete && (
            <Button
              variant="destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete item"
            >
              <FontAwesomeIcon icon={faTrash} />
            </Button>
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
