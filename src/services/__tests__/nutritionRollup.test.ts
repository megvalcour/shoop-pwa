import { describe, it, expect } from 'vitest';
import { computeNutritionRollup, type RollupIngredient } from '@/services/nutritionRollup';
import type { FdcNutrientPanel } from '@/db/schema';

function panel(fdc_id: string, per100g: Partial<FdcNutrientPanel['per100g']>): FdcNutrientPanel {
  return {
    fdc_id,
    description: fdc_id,
    per100g: {
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
      ...per100g,
    },
  };
}

describe('computeNutritionRollup', () => {
  it('sums per-100 g panels scaled by grams and divides by servings', () => {
    const ingredients: RollupIngredient[] = [
      { name: 'flour', grams: 200, panel: panel('a', { energyKcal: 364, protein: 10, carbs: 76 }) },
      { name: 'sugar', grams: 100, panel: panel('b', { energyKcal: 387, carbs: 100 }) },
    ];

    const rollup = computeNutritionRollup(ingredients, 4);

    // flour: ×2 → 728 kcal, 20 protein, 152 carbs; sugar: ×1 → 387 kcal, 100 carbs.
    expect(rollup.whole.energyKcal).toBeCloseTo(1115, 5);
    expect(rollup.whole.protein).toBeCloseTo(20, 5);
    expect(rollup.whole.carbs).toBeCloseTo(252, 5);
    expect(rollup.perServing.energyKcal).toBeCloseTo(1115 / 4, 5);
    expect(rollup.perServing.carbs).toBeCloseTo(252 / 4, 5);
    expect(rollup.enrichedCount).toBe(2);
    expect(rollup.totalCount).toBe(2);
    expect(rollup.unresolved).toEqual([]);
  });

  it('sums micros with the same keys as the targets', () => {
    const rollup = computeNutritionRollup(
      [{ name: 'spinach', grams: 100, panel: panel('c', { fiber: 2.2, iron: 2.7, calcium: 99, vitaminC: 28 }) }],
      1,
    );
    expect(rollup.whole.fiber).toBeCloseTo(2.2, 5);
    expect(rollup.whole.iron).toBeCloseTo(2.7, 5);
    expect(rollup.whole.calcium).toBeCloseTo(99, 5);
    expect(rollup.whole.vitaminC).toBeCloseTo(28, 5);
  });

  it('skips ingredients missing grams or a panel and names them in unresolved', () => {
    const ingredients: RollupIngredient[] = [
      { name: 'beans', grams: 100, panel: panel('d', { protein: 9 }) },
      { name: 'salt', grams: 1 }, // no panel
      { name: 'mystery', panel: panel('e', { protein: 5 }) }, // no grams
    ];

    const rollup = computeNutritionRollup(ingredients, 2);
    expect(rollup.whole.protein).toBeCloseTo(9, 5);
    expect(rollup.enrichedCount).toBe(1);
    expect(rollup.totalCount).toBe(3);
    expect(rollup.unresolved).toEqual(['salt', 'mystery']);
  });

  it('clamps a degenerate 0 servings to 1 (no Infinity)', () => {
    const rollup = computeNutritionRollup(
      [{ name: 'x', grams: 100, panel: panel('f', { energyKcal: 200 }) }],
      0,
    );
    expect(rollup.perServing.energyKcal).toBe(200);
  });

  it('returns all-zero totals for an empty recipe', () => {
    const rollup = computeNutritionRollup([], 4);
    expect(rollup.whole.energyKcal).toBe(0);
    expect(rollup.enrichedCount).toBe(0);
    expect(rollup.unresolved).toEqual([]);
  });
});
