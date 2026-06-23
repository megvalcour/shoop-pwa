import type { Store } from '@/db/schema';
import BottomSheet from '@/components/molecules/BottomSheet';
import SelectionList from '@/components/molecules/SelectionList';

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
      <SelectionList
        items={stores}
        getKey={(s) => s.id}
        isSelected={(s) => s.id === currentStoreId}
        renderLabel={(s) => (
          <span className="flex flex-col">
            <span>{s.name}</span>
            <span className="text-sm font-normal text-text-muted">{s.address}</span>
          </span>
        )}
        onSelect={(s) => {
          if (s.id !== currentStoreId) onSelect(s.id);
          onClose();
        }}
      />
    </BottomSheet>
  );
}
