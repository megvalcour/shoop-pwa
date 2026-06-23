import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import type { Aisle } from '@/db/schema';
import { formatAisleLabel } from '@/lib/formatAisleLabel';
import BottomSheet from '@/components/molecules/BottomSheet';

export interface AislePickerSheetProps {
  aisles: Aisle[];
  currentAisleId: string;
  onSelect: (aisleId: string) => void;
  onClose: () => void;
}

export default function AislePickerSheet({
  aisles,
  currentAisleId,
  onSelect,
  onClose,
}: AislePickerSheetProps) {
  return (
    <BottomSheet title="Choose aisle" onClose={onClose}>
      <ul>
        {aisles.map((aisle) => {
          const isSelected = aisle.id === currentAisleId;
          return (
            <li key={aisle.id}>
              <button
                className={`w-full flex items-center justify-between px-4 py-3 text-left ${
                  isSelected ? 'text-primary font-semibold' : 'text-text'
                }`}
                onClick={() => {
                  onSelect(aisle.id);
                  onClose();
                }}
              >
                <span>{formatAisleLabel(aisle)}</span>
                {isSelected && (
                  <FontAwesomeIcon icon={faCheck} className="text-primary" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
