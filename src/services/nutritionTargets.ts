import type { ActivityLevel, EatProfile, Sex } from '@/db/schema';

/**
 * Pure, deterministic daily-nutrition-target math for the Eat tab (Phase 2).
 *
 * No imports from `db/`, `hooks/`, React, or the network — every function here
 * is referentially transparent so the numbers can be pinned to hand-checked
 * references in the unit suite. All inputs are METRIC (kg, cm); the UI converts
 * at its edge (see services/units.ts) and the stored profile is metric-canonical.
 *
 * Targets correctness is the whole value of this phase, so the model and its
 * reference values are cited inline:
 *   - Energy: Mifflin–St Jeor BMR × activity factor (TDEE).
 *   - Macros (v1 split policy, intentionally simple + swappable): protein
 *     1.6 g/kg bodyweight, fat 30% of energy, carbs the remainder.
 *   - Micros: a curated subset of the NASEM/IOM Dietary Reference Intakes,
 *     sex/age-bracketed where the DRI differs.
 */

/** Activity multipliers applied to BMR to estimate Total Daily Energy Expenditure. */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Human-readable descriptions for the 5 activity levels (used by the form). */
export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary — little or no exercise',
  light: 'Lightly active — light exercise 1–3 days/week',
  moderate: 'Moderately active — moderate exercise 3–5 days/week',
  active: 'Active — hard exercise 6–7 days/week',
  very_active: 'Very active — hard daily exercise or a physical job',
};

/** v1 macro-split policy (documented as swappable — a one-line change here). */
export const PROTEIN_G_PER_KG = 1.6;
export const FAT_FRACTION_OF_ENERGY = 0.3;
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;

export interface MicroTarget {
  key: string;
  label: string;
  amount: number;
  unit: string;
}

export interface NutritionTargets {
  energyKcal: number;
  protein: { grams: number };
  fat: { grams: number };
  carbs: { grams: number };
  micros: MicroTarget[];
}

/**
 * Basal Metabolic Rate — Mifflin–St Jeor (1990):
 *   BMR = 10·kg + 6.25·cm − 5·age + s,  s = +5 (male) / −161 (female).
 */
export function computeBmr(weightKg: number, heightCm: number, age: number, sex: Sex): number {
  const s = sex === 'male' ? 5 : -161;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + s;
}

/** Total Daily Energy Expenditure: BMR scaled by the activity factor. */
export function computeTdee(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_FACTORS[activity];
}

/**
 * Curated micronutrient DRI targets, sex/age-bracketed. Values are the
 * NASEM/IOM Dietary Reference Intakes (RDA where one exists, else AI). Brackets
 * are kept minimal — only the boundaries where the curated set actually changes
 * (the ≥51 fiber/calcium/iron shifts and the ≥71 calcium/vitamin-D shift).
 *
 *   fiber      AI:  <51 → 38 (M) / 25 (F);  ≥51 → 30 (M) / 21 (F)   [g]
 *   sodium     CDRR upper-guidance for adults: 2300                  [mg]
 *   calcium    RDA: 1000 adults; 1200 women ≥51 and everyone ≥71     [mg]
 *   iron       RDA: 8 (M); 18 women 19–50, 8 women ≥51               [mg]
 *   potassium  AI: 3400 (M) / 2600 (F)                               [mg]
 *   vitamin C  RDA: 90 (M) / 75 (F)                                  [mg]
 *   vitamin D  RDA: 15 (19–70) / 20 (≥71), both sexes                [mcg]
 */
export function computeMicroTargets(age: number, sex: Sex): MicroTarget[] {
  const isMale = sex === 'male';

  const fiber = age >= 51 ? (isMale ? 30 : 21) : isMale ? 38 : 25;
  const calcium = age >= 71 || (!isMale && age >= 51) ? 1200 : 1000;
  const iron = isMale || age >= 51 ? 8 : 18;
  const potassium = isMale ? 3400 : 2600;
  const vitaminC = isMale ? 90 : 75;
  const vitaminD = age >= 71 ? 20 : 15;

  return [
    { key: 'fiber', label: 'Fiber', amount: fiber, unit: 'g' },
    { key: 'sodium', label: 'Sodium', amount: 2300, unit: 'mg' },
    { key: 'calcium', label: 'Calcium', amount: calcium, unit: 'mg' },
    { key: 'iron', label: 'Iron', amount: iron, unit: 'mg' },
    { key: 'potassium', label: 'Potassium', amount: potassium, unit: 'mg' },
    { key: 'vitaminC', label: 'Vitamin C', amount: vitaminC, unit: 'mg' },
    { key: 'vitaminD', label: 'Vitamin D', amount: vitaminD, unit: 'mcg' },
  ];
}

/**
 * Full daily targets for a profile: energy (TDEE), the three macros under the v1
 * split, and the curated micro panel. Raw precision is preserved (no rounding) —
 * the UI rounds at the display edge and keeps the exact numbers for future
 * per-day math and testability.
 *
 * The profile is the validation boundary (the form guarantees positive, in-range
 * fields); the only guard here is a cheap clamp so a degenerate profile can never
 * yield a negative carb gram count.
 */
export function computeTargets(profile: EatProfile): NutritionTargets {
  const { weightKg, heightCm, age, sex, activity } = profile;

  const bmr = computeBmr(weightKg, heightCm, age, sex);
  const energyKcal = computeTdee(bmr, activity);

  const proteinGrams = PROTEIN_G_PER_KG * weightKg;
  const fatGrams = (FAT_FRACTION_OF_ENERGY * energyKcal) / KCAL_PER_G_FAT;

  const proteinKcal = proteinGrams * KCAL_PER_G_PROTEIN;
  const fatKcal = fatGrams * KCAL_PER_G_FAT;
  const carbsKcal = Math.max(0, energyKcal - proteinKcal - fatKcal);
  const carbsGrams = carbsKcal / KCAL_PER_G_CARB;

  return {
    energyKcal,
    protein: { grams: proteinGrams },
    fat: { grams: fatGrams },
    carbs: { grams: carbsGrams },
    micros: computeMicroTargets(age, sex),
  };
}
