import type { Aisle } from '@/db/schema';
import Badge from '@/components/atoms/Badge';

interface AisleCardProps {
  aisle: Aisle;
}

export default function AisleCard({ aisle }: AisleCardProps) {
  return (
    <div className="px-4 py-3 bg-card rounded-lg shadow-sm flex items-center justify-between">
      <span className="font-medium text-text truncate">{aisle.label}</span>
      {aisle.number ? (
        <Badge className="ml-3">Aisle {aisle.number}</Badge>
      ) : (
        <Badge variant="muted" className="ml-3">Section</Badge>
      )}
    </div>
  );
}
