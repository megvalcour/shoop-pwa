import { useState } from 'react';
import { faRightLeft } from '@fortawesome/free-solid-svg-icons';
import type { Aisle } from '@/db/schema';
import AislePickerSheet from '@/components/molecules/AislePickerSheet';
import QuantitySheet from '@/components/molecules/QuantitySheet';
import Badge from '@/components/atoms/Badge';
import Icon from '@/components/atoms/Icon';
import Spinner from '@/components/atoms/Spinner';
import ListItemRow from '@/components/molecules/ListItemRow';
import SwipeableRow from '@/components/molecules/SwipeableRow';

interface GroceryListItemProps {
  name: string;
  quantity: number;
  unit?: string;
  checked?: boolean;
  onToggle?: () => void;
  onDelete?: () => void;
  /** Wire up to make the quantity editable (stepper + optional unit). */
  onQuantityChange?: (quantity: number, unit: string) => void;
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
  unit = '',
  checked = false,
  onToggle,
  onDelete,
  onQuantityChange,
  aisleLabel,
  isCategorizing = false,
  aisles,
  currentAisleId = '',
  onAisleChange,
}: GroceryListItemProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [qtySheetOpen, setQtySheetOpen] = useState(false);

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
    // De-emphasized: a quiet, muted swap affordance so it stops competing for
    // attention on every row mid-shop (the placard header carries wayfinding).
    badge = (
      <Badge
        variant="muted"
        className="px-1.5 py-0.5 text-[10px]"
        onClick={openPicker}
        aria-label={`Change aisle: ${aisleLabel}`}
      >
        <Icon icon={faRightLeft} />
      </Badge>
    );
  } else if (canPickAisle) {
    // Settled-uncategorized: a clearly actionable "needs your input" affordance,
    // visually distinct from the busy spinner.
    badge = (
      <Badge
        variant="muted"
        className="px-2.5 py-1"
        onClick={openPicker}
        aria-label="Categorize item"
      >
        Categorize
      </Badge>
    );
  }

  const row = (
    <ListItemRow
      as="div"
      name={name}
      quantity={quantity}
      unit={unit}
      checked={checked}
      onToggle={onToggle}
      // No persistent trash button in the in-motion list: deletion is the
      // swipe gesture (with an accessible button) on SwipeableRow instead.
      // Quantity is meaningful on done items too, so it stays editable
      // regardless of checked state (unlike the aisle badge).
      onQuantityClick={onQuantityChange ? () => setQtySheetOpen(true) : undefined}
      badge={badge}
    />
  );

  return (
    <>
      {onDelete ? (
        <SwipeableRow onDelete={onDelete} deleteLabel={`Delete ${name}`}>
          {row}
        </SwipeableRow>
      ) : (
        <li className="relative">{row}</li>
      )}
      {sheetOpen && aisles && onAisleChange && (
        <AislePickerSheet
          aisles={aisles}
          currentAisleId={currentAisleId}
          onSelect={onAisleChange}
          onClose={() => setSheetOpen(false)}
        />
      )}
      {qtySheetOpen && onQuantityChange && (
        <QuantitySheet
          quantity={quantity}
          unit={unit}
          onSave={onQuantityChange}
          onClose={() => setQtySheetOpen(false)}
        />
      )}
    </>
  );
}
