import type { ReactNode } from 'react';
import type { Aisle } from '@/db/schema';
import Badge from '@/components/atoms/Badge';

interface AisleCardProps {
  aisle: Aisle;
  handle?: ReactNode;
}

export default function AisleCard({ aisle, handle }: AisleCardProps) {
  return (
    <div className="px-4 py-3 bg-card rounded-xl shadow-card flex items-center justify-between">
      <div className="flex items-center gap-3 min-w-0">
        {handle}
        <span className="font-semibold text-text truncate">{aisle.label}</span>
      </div>
      {aisle.number ? (
        <Badge className="ml-3">Aisle {aisle.number}</Badge>
      ) : (
        <Badge variant="muted" className="ml-3">Section</Badge>
      )}
    </div>
  );
}
