import { describe, it, expect } from 'vitest';
import {
  flattenTargets,
  sumDayTotals,
  scoreTotals,
  scoreTone,
  weeklyAveragePerDay,
  ON_BAND_LOW,
  ON_BAND_HIGH,
} from '@/services/mealPlanScore';
import { emptyTotals, type NutrientTotals } from '@/services/nutritionRollup';
import type { NutritionTargets } from '@/services/nutritionTargets';

const TARGETS: NutritionTargets = {
  energyKcal: 2000,
  protein: { grams: 100 },
  fat: { grams: 60 },
  carbs: { grams: 250 },
  micros: [
    { key: 'fiber', label: 'Fiber', amount: 30, unit: 'g' },
    { key: 'sodium', label: 'Sodium', amount: 2300, unit: 'mg' },
    { key: 'calcium', label: 'Calcium', amount: 1000, unit: 'mg' },
    { key: 'iron', label: 'Iron', amount: 8, unit: 'mg' },
    { key: 'potassium', label: 'Potassium', amount: 3400, unit: 'mg' },
    { key: 'vitaminC', label: 'Vitamin C', amount: 90, unit: 'mg' },
    { key: 'vitaminD', label: 'Vitamin D', amount: 15, unit: 'mcg' },
  ],
};

function totals(overrides: Partial<NutrientTotals>): NutrientTotals {
  return { ...emptyTotals(), ...overrides };
}

describe('flattenTargets', () => {
  it('maps the nested target shape onto the flat NutrientTotals key space', () => {
    const flat = flattenTargets(TARGETS);
    expect(flat.energyKcal).toBe(2000);
    expect(flat.protein).toBe(100);
    expect(flat.fat).toBe(60);
    expect(flat.carbs).toBe(250);
    expect(flat.fiber).toBe(30);
    expect(flat.sodium).toBe(2300);
    expect(flat.calcium).toBe(1000);
    expect(flat.iron).toBe(8);
    expect(flat.potassium).toBe(3400);
    expect(flat.vitaminC).toBe(90);
    expect(flat.vitaminD).toBe(15);
  });

  it('defaults a micro absent from the curated panel to 0', () => {
    const flat = flattenTargets({ ...TARGETS, micros: [] });
    expect(flat.fiber).toBe(0);
    expect(flat.sodium).toBe(0);
    // Macros + energy still come through.
    expect(flat.protein).toBe(100);
  });
});

describe('sumDayTotals', () => {
  it('sums perServing × planned_servings across a day, skipping unenriched recipes', () => {
    const perServing = new Map<string, NutrientTotals>([
      ['a', totals({ energyKcal: 100, protein: 10 })],
      ['b', totals({ energyKcal: 250, protein: 5 })],
    ]);
    const day = sumDayTotals(
      [
        { recipe_id: 'a', planned_servings: 2 }, // 200 / 20
        { recipe_id: 'b', planned_servings: 1 }, // 250 / 5
        { recipe_id: 'missing', planned_servings: 3 }, // skipped (no rollup)
      ],
      perServing,
    );
    expect(day.energyKcal).toBe(450);
    expect(day.protein).toBe(25);
  });

  it('returns empty totals for an empty day', () => {
    expect(sumDayTotals([], new Map())).toEqual(emptyTotals());
  });
});

describe('scoreTotals', () => {
  const target = flattenTargets(TARGETS);

  it('flags a shortfall as under for a meet nutrient', () => {
    const [, protein] = scoreTotals(totals({ protein: 50 }), target); // index 1 = protein
    expect(protein.key).toBe('protein');
    expect(protein.pct).toBeCloseTo(0.5, 5);
    expect(protein.status).toBe('under');
    expect(protein.direction).toBe('meet');
    expect(scoreTone(protein)).toBe('low');
  });

  it('treats the 90–110% band as on-target', () => {
    const low = scoreTotals(totals({ protein: 100 * ON_BAND_LOW }), target)[1];
    const high = scoreTotals(totals({ protein: 100 * ON_BAND_HIGH }), target)[1];
    expect(low.status).toBe('on');
    expect(high.status).toBe('on');
    expect(scoreTone(low)).toBe('good');
  });

  it('exceeding a meet floor reads as over but a good tone', () => {
    const protein = scoreTotals(totals({ protein: 150 }), target)[1];
    expect(protein.status).toBe('over');
    expect(scoreTone(protein)).toBe('good');
  });

  it('over a sodium cap is over with a high (concern) tone; under the cap is good', () => {
    const order = scoreTotals(totals({ sodium: 3000 }), target);
    const sodiumOver = order.find((s) => s.key === 'sodium')!;
    expect(sodiumOver.direction).toBe('limit');
    expect(sodiumOver.status).toBe('over');
    expect(scoreTone(sodiumOver)).toBe('high');

    const sodiumUnder = scoreTotals(totals({ sodium: 500 }), target).find((s) => s.key === 'sodium')!;
    expect(sodiumUnder.status).toBe('under');
    expect(scoreTone(sodiumUnder)).toBe('good');
  });

  it('energy over its band reads as a concern (target direction)', () => {
    const energy = scoreTotals(totals({ energyKcal: 3000 }), target)[0];
    expect(energy.key).toBe('energyKcal');
    expect(energy.direction).toBe('target');
    expect(energy.status).toBe('over');
    expect(scoreTone(energy)).toBe('high');
  });

  it('returns scores in display order: energy, macros, then micros', () => {
    const keys = scoreTotals(emptyTotals(), target).map((s) => s.key);
    expect(keys).toEqual([
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
    ]);
  });

  it('guards a non-positive target (pct 0, never Infinity)', () => {
    const flat = flattenTargets({ ...TARGETS, micros: [] }); // sodium target = 0
    const sodium = scoreTotals(totals({ sodium: 500 }), flat).find((s) => s.key === 'sodium')!;
    expect(sodium.pct).toBe(0);
    expect(Number.isFinite(sodium.pct)).toBe(true);
  });

  it('an all-zero day scores every nutrient under (a partial/empty contribution)', () => {
    const scores = scoreTotals(emptyTotals(), target);
    // Sodium under its cap is fine, but positionally still "under".
    expect(scores.every((s) => s.status === 'under')).toBe(true);
  });
});

describe('weeklyAveragePerDay', () => {
  it('divides the week total by 7 (typical day), regardless of how many days carry food', () => {
    const week = [
      totals({ energyKcal: 2100, protein: 70 }),
      totals({ energyKcal: 1400, protein: 70 }),
    ];
    const avg = weeklyAveragePerDay(week);
    expect(avg.energyKcal).toBeCloseTo(3500 / 7, 5); // 500
    expect(avg.protein).toBeCloseTo(140 / 7, 5); // 20
  });

  it('an empty week averages to all zeros', () => {
    expect(weeklyAveragePerDay([])).toEqual(emptyTotals());
  });
});
