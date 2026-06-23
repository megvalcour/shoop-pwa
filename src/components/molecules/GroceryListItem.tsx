import { useState } from 'react';
import type { Aisle } from '@/db/schema';
import AislePickerSheet from '@/components/molecules/AislePickerSheet';
import Badge from '@/components/atoms/Badge';
import Spinner from '@/components/atoms/Spinner';
import ListItemRow from '@/components/molecules/ListItemRow';

interface GroceryListItemProps {
  name: string;
  quantity: number;
  checked?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  aisleLabel?: string;
  /** The matcher is actively working on this item — a status, not an action.
   *  Renders a non-interactive spinner badge; never under "Uncategorized". */
  isCategorizing?: boolean;
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
  isCategorizing = false,
  aisles,
  currentAisleId = '',
  onAisleChange,
}: GroceryListItemProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  // The aisle badge is tappable for unchecked items as long as the picker is
  // wired up — this includes settled-uncategorized items (the "Categorize" badge).
  const canPickAisle = !checked && Boolean(aisles) && Boolean(onAisleChange);

  const openPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSheetOpen(true);
  };

  let badge: React.ReactNode = null;
  if (isCategorizing && !checked) {
    // Status, not an action: no onClick, no picker.
    badge = (
      <Badge variant="muted" className="px-2.5 py-1 leading-none">
        <Spinner aria-label="Categorizing item" />
      </Badge>
    );
  } else if (aisleLabel) {
    badge = (
      <Badge className="px-2.5 py-1" onClick={openPicker} aria-label={`Change aisle: ${aisleLabel}`}>
        {aisleLabel}
      </Badge>
    );
  } else if (canPickAisle) {
    // Settled-uncategorized: a clearly actionable "needs your input" affordance,
    // visually distinct from the busy spinner.
    badge = (
      <Badge variant="muted" className="px-2.5 py-1" onClick={openPicker} aria-label="Categorize item">
        Categorize
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
