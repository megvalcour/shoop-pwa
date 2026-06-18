import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Aisle } from '@/db/schema';

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
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-surface rounded-t-2xl max-h-[60vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-text">Choose aisle</span>
          <button
            onClick={onClose}
            aria-label="Close aisle picker"
            className="p-1 text-text-muted"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <ul className="overflow-y-auto flex-1">
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
                  <span>
                    {aisle.number && /^\d+$/.test(aisle.number)
                      ? `Aisle ${aisle.number} — ${aisle.label}`
                      : aisle.label}
                  </span>
                  {isSelected && (
                    <FontAwesomeIcon icon={faCheck} className="text-primary" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
