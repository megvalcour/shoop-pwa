import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import type { Store } from '@/db/schema';
import BottomSheet from '@/components/molecules/BottomSheet';

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
    <BottomSheet title="Switch store" onClose={onClose}>
      <ul>
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
    </BottomSheet>
  );
}
