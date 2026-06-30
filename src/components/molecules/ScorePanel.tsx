/**
 * Lays out {@link NutrientRing}s for a scored day or the weekly summary (Eat tab,
 * Phase 5). Pure props-in — the `WeeklyPlan` organism owns the scoring; this just
 * groups the scores into energy / macros / micros (mirroring `DailyTargets` and
 * `NutritionPanel`) and renders a ring per nutrient. Role tokens only, so it
 * themes green under /eat (ADR-0028).
 *
 * `variant="compact"` shows only energy + the three macros (small rings) for the
 * per-day at-a-glance score inside a `DayColumn`; `variant="full"` shows the whole
 * panel (energy, macros, micros) for the weekly summary.
 */

import NutrientRing from '@/components/molecules/NutrientRing';
import {
  MACRO_KEYS,
  MICRO_KEYS,
  scoreTone,
  type NutrientScore,
} from '@/services/mealPlanScore';
import type { NutrientTotals } from '@/services/nutritionRollup';

export interface ScorePanelProps {
  scores: NutrientScore[];
  variant?: 'full' | 'compact';
}

function ringsFor(
  scores: NutrientScore[],
  keys: ReadonlyArray<keyof NutrientTotals>,
  size: 'sm' | 'md',
) {
  const byKey = new Map(scores.map((score) => [score.key, score]));
  return keys
    .map((key) => byKey.get(key))
    .filter((score): score is NutrientScore => score !== undefined)
    .map((score) => (
      <NutrientRing
        key={score.key}
        label={score.label}
        value={score.value}
        target={score.target}
        unit={score.unit}
        pct={score.pct}
        tone={scoreTone(score)}
        size={size}
      />
    ));
}

export default function ScorePanel({ scores, variant = 'full' }: ScorePanelProps) {
  if (variant === 'compact') {
    return (
      <div className="grid grid-cols-4 gap-2">
        {ringsFor(scores, ['energyKcal', ...MACRO_KEYS], 'sm')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">{ringsFor(scores, ['energyKcal'], 'md')}</div>

      <div>
        <h3 className="text-sm font-bold text-text mb-2">Macros</h3>
        <div className="grid grid-cols-3 gap-2">{ringsFor(scores, MACRO_KEYS, 'md')}</div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-text mb-2">Micronutrients</h3>
        <div className="grid grid-cols-3 gap-3">{ringsFor(scores, MICRO_KEYS, 'sm')}</div>
      </div>
    </div>
  );
}
