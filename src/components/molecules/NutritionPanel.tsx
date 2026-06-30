/**
 * Presentational nutrient panel (Eat tab, Phase 4): energy + the three macros +
 * the curated micronutrients, laid out like `DailyTargets` so a recipe's own
 * numbers read consistently with the profile targets. Pure props-in — the
 * `RecipeNutrition` organism owns the per-serving/whole toggle and passes the
 * chosen totals. Role tokens only, so it themes green under /eat (ADR-0028).
 *
 * Rounding happens HERE, at the display edge: the rollup keeps raw precision for
 * testability and the future target join (Phase 5).
 */

import TargetReadout from '@/components/molecules/TargetReadout';
import type { NutrientTotals } from '@/services/nutritionRollup';

export interface NutritionPanelProps {
  totals: NutrientTotals;
}

/** The micro readouts, keyed + unit-matched to `nutritionTargets`' micro panel. */
const MICROS: Array<{ key: keyof NutrientTotals; label: string; unit: string }> = [
  { key: 'fiber', label: 'Fiber', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
  { key: 'calcium', label: 'Calcium', unit: 'mg' },
  { key: 'iron', label: 'Iron', unit: 'mg' },
  { key: 'potassium', label: 'Potassium', unit: 'mg' },
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg' },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg' },
];

function round(value: number): string {
  return Math.round(value).toLocaleString();
}

export default function NutritionPanel({ totals }: NutritionPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <TargetReadout label="Energy" value={round(totals.energyKcal)} unit="kcal" />

      <div>
        <h3 className="text-sm font-bold text-text mb-2">Macros</h3>
        <div className="grid grid-cols-3 gap-2">
          <TargetReadout label="Protein" value={round(totals.protein)} unit="g" />
          <TargetReadout label="Carbs" value={round(totals.carbs)} unit="g" />
          <TargetReadout label="Fat" value={round(totals.fat)} unit="g" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-text mb-2">Micronutrients</h3>
        <div className="grid grid-cols-2 gap-2">
          {MICROS.map((micro) => (
            <TargetReadout
              key={micro.key}
              label={micro.label}
              value={round(totals[micro.key])}
              unit={micro.unit}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
