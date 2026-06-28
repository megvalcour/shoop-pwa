import { useState } from 'react';
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import BottomSheet from '@/components/molecules/BottomSheet';
import Button from '@/components/atoms/Button';
import Icon from '@/components/atoms/Icon';
import Input from '@/components/atoms/Input';

/** Datalist id wiring the unit input to its suggestions when provided. */
const UNIT_DATALIST_ID = 'quantity-sheet-units';

export interface QuantitySheetProps {
  quantity: number;
  unit: string;
  onSave: (quantity: number, unit: string) => void;
  onClose: () => void;
  /**
   * Optional curated unit hints. When supplied, the unit input is backed by a
   * `<datalist>` of these values (used by the recipe-import preview); other
   * callers omit it for a plain free-text field.
   */
  unitSuggestions?: readonly string[];
}

/**
 * Edit an item's quantity (integer stepper, clamped at a minimum of 1) and an
 * optional free-text unit. Mirrors AislePickerSheet: wraps BottomSheet and is
 * driven purely by callbacks — mutations are wired in the organisms.
 */
export default function QuantitySheet({
  quantity,
  unit,
  onSave,
  onClose,
  unitSuggestions,
}: QuantitySheetProps) {
  const [draftQuantity, setDraftQuantity] = useState(quantity);
  const [draftUnit, setDraftUnit] = useState(unit);

  function handleSave() {
    onSave(draftQuantity, draftUnit.trim());
    onClose();
  }

  return (
    <BottomSheet title="Edit quantity" onClose={onClose}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-center gap-6">
          <Button
            variant="secondary"
            shape="icon"
            onClick={() => setDraftQuantity((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
          >
            <Icon icon={faMinus} />
          </Button>
          <span className="min-w-8 text-center text-2xl font-semibold text-text" aria-live="polite">
            {draftQuantity}
          </span>
          <Button
            variant="secondary"
            shape="icon"
            onClick={() => setDraftQuantity((q) => q + 1)}
            aria-label="Increase quantity"
          >
            <Icon icon={faPlus} />
          </Button>
        </div>

        <label htmlFor="quantity-unit-input" className="sr-only">
          Unit
        </label>
        <Input
          id="quantity-unit-input"
          type="text"
          value={draftUnit}
          onChange={(e) => setDraftUnit(e.target.value)}
          placeholder="unit (optional)"
          list={unitSuggestions ? UNIT_DATALIST_ID : undefined}
        />
        {unitSuggestions && (
          <datalist id={UNIT_DATALIST_ID}>
            {unitSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        )}

        <Button variant="primary" onClick={handleSave}>
          Save
        </Button>
      </div>
    </BottomSheet>
  );
}
