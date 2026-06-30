/**
 * A single daily-target readout (Eat tab, Phase 2): a label with its value and
 * unit. Used for energy, each macro, and each curated micronutrient. Purely
 * presentational — no store access — and themed with role tokens so it renders
 * green under /eat.
 */

export interface TargetReadoutProps {
  label: string;
  /** Pre-formatted display value (the caller rounds; the service keeps raw precision). */
  value: string;
  unit: string;
}

export default function TargetReadout({ label, value, unit }: TargetReadoutProps) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2 bg-card rounded-lg shadow-card">
      <span className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className="text-text">
        <span className="font-display font-bold text-lg">{value}</span>
        <span className="text-sm text-text-muted ml-1">{unit}</span>
      </span>
    </div>
  );
}
