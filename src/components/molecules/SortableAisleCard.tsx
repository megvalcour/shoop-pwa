import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGripVertical } from '@fortawesome/free-solid-svg-icons';
import type { Aisle } from '@/db/schema';
import AisleCard from '@/components/molecules/AisleCard';

interface SortableAisleCardProps {
  aisle: Aisle;
}

export default function SortableAisleCard({ aisle }: SortableAisleCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: aisle.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'relative z-10 rounded-lg opacity-90 shadow-lg' : undefined}
    >
      <AisleCard
        aisle={aisle}
        handle={
          <button
            type="button"
            className={`shrink-0 touch-none text-text-muted p-1 -ml-1 ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            aria-label={`Reorder ${aisle.label}`}
            {...attributes}
            {...listeners}
          >
            <FontAwesomeIcon icon={faGripVertical} />
          </button>
        }
      />
    </div>
  );
}
