/**
 * Pure nutrition summation for the Eat tab (Phase 4 — ADR-0026/0027). Sums each
 * enriched ingredient's per-100 g panel scaled by its resolved grams into a
 * whole-recipe and per-serving {@link NutrientTotals}. Tolerant of partial
 * enrichment: an ingredient missing its grams or its panel is skipped and named
 * in `unresolved`, so the rollup always reflects exactly what is known.
 *
 * No imports from `db/`, `hooks/`, React, or the network — referentially
 * transparent so the totals can be pinned in the unit suite. The `NutrientTotals`
 * keys are the SAME identifiers `nutritionTargets` uses (energy + 3 macros + 7
 * micros), so Phase 5 scores rollup-vs-target by key match, no mapping table. No
 * rounding here — the UI rounds at the display edge (as `DailyTargets` does).
 */

import type { FdcNutrientPanel } from '@/db/schema';

/** Totals keyed to match `nutritionTargets`: energy + macros + curated micros. */
export interface NutrientTotals {
  energyKcal: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number;
  sodium: number;
  calcium: number;
  iron: number;
  potassium: number;
  vitaminC: number;
  vitaminD: number;
}

/** The nutrient keys summed, in the panel's per-100 g shape. */
export const NUTRIENT_KEYS: ReadonlyArray<keyof NutrientTotals> = [
  'energyKcal',
  'protein',
  'fat',
  'carbs',
  'fiber',
  'sodium',
  'calcium',
  'iron',
  'potassium',
  'vitaminC',
  'vitaminD',
];

/** One ingredient's contribution: its display name + resolved grams + FDC panel. */
export interface RollupIngredient {
  name: string;
  grams?: number;
  panel?: FdcNutrientPanel;
}

export interface NutritionRollup {
  whole: NutrientTotals;
  perServing: NutrientTotals;
  /** Ingredients that contributed (both grams and panel resolved). */
  enrichedCount: number;
  totalCount: number;
  /** Names of ingredients still missing grams or a panel — surfaced in the UI. */
  unresolved: string[];
}

export function emptyTotals(): NutrientTotals {
  return {
    energyKcal: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    fiber: 0,
    sodium: 0,
    calcium: 0,
    iron: 0,
    potassium: 0,
    vitaminC: 0,
    vitaminD: 0,
  };
}

function scaleTotals(totals: NutrientTotals, divisor: number): NutrientTotals {
  if (divisor <= 0) return { ...totals };
  const out = emptyTotals();
  for (const key of NUTRIENT_KEYS) out[key] = totals[key] / divisor;
  return out;
}

/**
 * Roll up a recipe's ingredients into whole + per-serving totals. `servings`
 * divides the whole totals (clamped to ≥1 so a degenerate 0 never yields
 * Infinity). An ingredient contributes `panel.per100g[k] * grams / 100`; one
 * missing grams or a panel is skipped and listed in `unresolved`.
 */
export function computeNutritionRollup(
  ingredients: RollupIngredient[],
  servings: number,
): NutritionRollup {
  const whole = emptyTotals();
  const unresolved: string[] = [];
  let enrichedCount = 0;

  for (const ingredient of ingredients) {
    if (ingredient.grams === undefined || !ingredient.panel) {
      unresolved.push(ingredient.name);
      continue;
    }
    const factor = ingredient.grams / 100;
    for (const key of NUTRIENT_KEYS) {
      whole[key] += ingredient.panel.per100g[key] * factor;
    }
    enrichedCount += 1;
  }

  const divisor = servings > 0 ? servings : 1;
  return {
    whole,
    perServing: scaleTotals(whole, divisor),
    enrichedCount,
    totalCount: ingredients.length,
    unresolved,
  };
}
