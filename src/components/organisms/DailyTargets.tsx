import TargetReadout from '@/components/molecules/TargetReadout';
import type { NutritionTargets } from '@/services/nutritionTargets';

/**
 * Lays out a profile's computed daily targets (Eat tab, Phase 2): energy, the
 * three macros, and the curated micronutrient panel. Pure props-in — the route
 * owns the profile→targets computation, so this stays testable without hooks.
 *
 * Rounding happens HERE, at the display edge: the service returns raw precision
 * for testability and future per-day math; readouts round to whole units.
 */

export interface DailyTargetsProps {
  targets: NutritionTargets;
}

function round(value: number): string {
  return Math.round(value).toLocaleString();
}

export default function DailyTargets({ targets }: DailyTargetsProps) {
  const { energyKcal, protein, fat, carbs, micros } = targets;

  return (
    <div className="flex flex-col gap-4">
      <TargetReadout label="Energy" value={round(energyKcal)} unit="kcal" />

      <div>
        <h3 className="text-sm font-bold text-text mb-2">Macros</h3>
        <div className="grid grid-cols-3 gap-2">
          <TargetReadout label="Protein" value={round(protein.grams)} unit="g" />
          <TargetReadout label="Carbs" value={round(carbs.grams)} unit="g" />
          <TargetReadout label="Fat" value={round(fat.grams)} unit="g" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-text mb-2">Micronutrients</h3>
        <div className="grid grid-cols-2 gap-2">
          {micros.map((micro) => (
            <TargetReadout
              key={micro.key}
              label={micro.label}
              value={round(micro.amount)}
              unit={micro.unit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
