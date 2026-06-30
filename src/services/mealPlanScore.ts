/**
 * Pure scoring math for the Eat tab weekly plan (Phase 5 — ADR-0026/0029). Turns
 * a day's (or a week's) summed nutrition into a per-nutrient %-of-target score
 * against the Phase 2 daily targets. No imports from `db/`, `hooks/`, React, or
 * the network — referentially transparent so every band/branch can be pinned in
 * the unit suite.
 *
 * Key alignment is load-bearing: `NutrientTotals` (Phase 4 rollups) and
 * `NutritionTargets` (Phase 2) already share the SAME nutrient identifiers by
 * design, so the only adapter needed is `flattenTargets` (nested target shape →
 * flat `NutrientTotals` key space). After that, scoring is a straight key match —
 * no mapping table (locked in Phase 4).
 */

import { emptyTotals, NUTRIENT_KEYS, type NutrientTotals } from '@/services/nutritionRollup';
import type { NutritionTargets } from '@/services/nutritionTargets';

/**
 * Positional band of actual vs target: `under` (<90%), `on` (90–110%), `over`
 * (>110%). Direction (below) decides whether `over`/`under` is good or a concern.
 */
export type ScoreStatus = 'under' | 'on' | 'over';

/**
 * How a nutrient's target reads:
 *  - `meet`   — a floor to reach (protein, fiber, calcium, …): under = shortfall,
 *               over = fine.
 *  - `limit`  — a cap to stay under (sodium): over = a concern, under = fine.
 *  - `target` — a band to land in (energy): both under and over are notable.
 */
export type NutrientDirection = 'meet' | 'limit' | 'target';

export interface NutrientScore {
  key: keyof NutrientTotals;
  label: string;
  unit: string;
  /** Actual planned amount (raw precision; the UI rounds at the display edge). */
  value: number;
  /** Daily target for this nutrient (the scoring denominator). */
  target: number;
  /** value / target as a fraction (0..n); 0 when there is no positive target. */
  pct: number;
  status: ScoreStatus;
  direction: NutrientDirection;
}

/** The "on target" band: 90–110% of the daily target reads as on-target. */
export const ON_BAND_LOW = 0.9;
export const ON_BAND_HIGH = 1.1;

interface NutrientMeta {
  label: string;
  unit: string;
  direction: NutrientDirection;
}

/**
 * Per-nutrient display metadata + scoring direction, in display order (energy,
 * macros, then the curated micro panel — mirrors `DailyTargets`/`NutritionPanel`).
 * Sodium is the one `limit`; energy is a `target` band; everything else is a
 * `meet` floor. Swappable policy, like the Phase 2 macro split.
 */
export const NUTRIENT_META: Record<keyof NutrientTotals, NutrientMeta> = {
  energyKcal: { label: 'Energy', unit: 'kcal', direction: 'target' },
  protein: { label: 'Protein', unit: 'g', direction: 'meet' },
  carbs: { label: 'Carbs', unit: 'g', direction: 'meet' },
  fat: { label: 'Fat', unit: 'g', direction: 'meet' },
  fiber: { label: 'Fiber', unit: 'g', direction: 'meet' },
  sodium: { label: 'Sodium', unit: 'mg', direction: 'limit' },
  calcium: { label: 'Calcium', unit: 'mg', direction: 'meet' },
  iron: { label: 'Iron', unit: 'mg', direction: 'meet' },
  potassium: { label: 'Potassium', unit: 'mg', direction: 'meet' },
  vitaminC: { label: 'Vitamin C', unit: 'mg', direction: 'meet' },
  vitaminD: { label: 'Vitamin D', unit: 'mcg', direction: 'meet' },
};

/** The display order for scores: energy, the three macros, then the micros. */
export const SCORE_ORDER: ReadonlyArray<keyof NutrientTotals> = [
  'energyKcal',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sodium',
  'calcium',
  'iron',
  'potassium',
  'vitaminC',
  'vitaminD',
];

/** The macro keys (used by the compact day score). */
export const MACRO_KEYS: ReadonlyArray<keyof NutrientTotals> = ['protein', 'carbs', 'fat'];
/** The curated micro keys, in display order. */
export const MICRO_KEYS: ReadonlyArray<keyof NutrientTotals> = [
  'fiber',
  'sodium',
  'calcium',
  'iron',
  'potassium',
  'vitaminC',
  'vitaminD',
];

/**
 * Adapt the Phase 2 targets' nested shape (`protein.grams`, `micros[]`) onto the
 * flat `NutrientTotals` key space so actual and target share one key set. A micro
 * key absent from the curated panel defaults to 0 (never scored against a phantom
 * target).
 */
export function flattenTargets(targets: NutritionTargets): NutrientTotals {
  const flat = emptyTotals();
  flat.energyKcal = targets.energyKcal;
  flat.protein = targets.protein.grams;
  flat.fat = targets.fat.grams;
  flat.carbs = targets.carbs.grams;
  for (const micro of targets.micros) {
    if (micro.key in flat) {
      flat[micro.key as keyof NutrientTotals] = micro.amount;
    }
  }
  return flat;
}

/** A day's planned nutrition: Σ over its entries of `perServing × planned_servings`. */
export interface DayEntry {
  recipe_id: string;
  planned_servings: number;
}

export function sumDayTotals(
  entries: DayEntry[],
  perServingByRecipeId: Map<string, NutrientTotals>,
): NutrientTotals {
  const totals = emptyTotals();
  for (const entry of entries) {
    const perServing = perServingByRecipeId.get(entry.recipe_id);
    if (!perServing) continue; // unenriched / orphan recipe — contributes nothing
    for (const key of NUTRIENT_KEYS) {
      totals[key] += perServing[key] * entry.planned_servings;
    }
  }
  return totals;
}

function statusFor(pct: number): ScoreStatus {
  if (pct < ON_BAND_LOW) return 'under';
  if (pct > ON_BAND_HIGH) return 'over';
  return 'on';
}

/**
 * Score actual totals against (flattened) targets, one {@link NutrientScore} per
 * nutrient in display order. `pct` guards a non-positive target (returns 0 rather
 * than Infinity/NaN); in practice every Phase 2 target is positive.
 */
export function scoreTotals(actual: NutrientTotals, target: NutrientTotals): NutrientScore[] {
  return SCORE_ORDER.map((key) => {
    const value = actual[key];
    const targetValue = target[key];
    const pct = targetValue > 0 ? value / targetValue : 0;
    const meta = NUTRIENT_META[key];
    return {
      key,
      label: meta.label,
      unit: meta.unit,
      value,
      target: targetValue,
      pct,
      status: statusFor(pct),
      direction: meta.direction,
    };
  });
}

/** Visual tone of a score, given its band + direction (color is never the sole signal). */
export type ScoreTone = 'good' | 'low' | 'high';

export function scoreTone(score: Pick<NutrientScore, 'status' | 'direction'>): ScoreTone {
  if (score.status === 'on') return 'good';
  if (score.status === 'under') {
    // Under a cap (limit) is good; under a floor/band is a shortfall.
    return score.direction === 'limit' ? 'good' : 'low';
  }
  // over: exceeding a floor is good; over a cap/band is a concern.
  return score.direction === 'meet' ? 'good' : 'high';
}

/**
 * The "typical day this week": the week's total nutrition divided by 7. Light days
 * dilute heavy ones, so this reads as an average day — NOT "every day hit target".
 * Always ÷ 7 (the fixed grid length), regardless of how many days carry food.
 */
export function weeklyAveragePerDay(dayTotals: NutrientTotals[]): NutrientTotals {
  const avg = emptyTotals();
  for (const totals of dayTotals) {
    for (const key of NUTRIENT_KEYS) {
      avg[key] += totals[key];
    }
  }
  for (const key of NUTRIENT_KEYS) {
    avg[key] /= 7;
  }
  return avg;
}
