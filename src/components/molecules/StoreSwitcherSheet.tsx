import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Store } from '@/db/schema';
import Button from '@/components/atoms/Button';

export interface StoreSwitcherSheetProps {
  stores: Store[];
  currentStoreId: string;
  onSelect: (storeId: string) => void;
  onClose: () => void;
}

export default function StoreSwitcherSheet({
  stores,
  currentStoreId,
  onSelect,
  onClose,
}: StoreSwitcherSheetProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-surface rounded-t-2xl max-h-[60vh] flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-text">Switch store</span>
          <Button onClick={onClose} aria-label="Close store switcher">
            <FontAwesomeIcon icon={faXmark} />
          </Button>
        </div>
        <ul className="overflow-y-auto flex-1">
          {stores.map((store) => {
            const isSelected = store.id === currentStoreId;
            return (
              <li key={store.id}>
                <button
                  className={`w-full flex items-center justify-between px-4 py-3 text-left ${
                    isSelected ? 'text-primary font-semibold' : 'text-text'
                  }`}
                  onClick={() => {
                    if (!isSelected) onSelect(store.id);
                    onClose();
                  }}
                >
                  <span className="flex flex-col">
                    <span>{store.name}</span>
                    <span className="text-sm font-normal text-text-muted">{store.address}</span>
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
