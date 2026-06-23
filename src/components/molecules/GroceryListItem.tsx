import { useState } from 'react';
import type { Aisle } from '@/db/schema';
import AislePickerSheet from '@/components/molecules/AislePickerSheet';
import Badge from '@/components/atoms/Badge';
import ListItemRow from '@/components/molecules/ListItemRow';

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

  let badge: React.ReactNode = null;
  if (isAnalyzing) {
    badge = canPickAisle ? (
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
    );
  } else if (aisleLabel) {
    badge = (
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
    );
  }

  return (
    <>
      <ListItemRow
        name={name}
        quantity={quantity}
        checked={checked}
        onToggle={onToggle}
        onDelete={onDelete}
        badge={badge}
      />
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
