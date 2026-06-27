import type { Aisle } from '@/db/schema';
import { formatAisleLabel } from '@/utils/formatAisleLabel';
import BottomSheet from '@/components/molecules/BottomSheet';
import SelectionList from '@/components/molecules/SelectionList';

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
      <SelectionList
        items={aisles}
        getKey={(a) => a.id}
        isSelected={(a) => a.id === currentAisleId}
        renderLabel={(a) => formatAisleLabel(a)}
        onSelect={(a) => {
          onSelect(a.id);
          onClose();
        }}
      />
    </BottomSheet>
  );
}
