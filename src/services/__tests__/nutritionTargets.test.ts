import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_FACTORS,
  computeBmr,
  computeMicroTargets,
  computeTargets,
  computeTdee,
} from '@/services/nutritionTargets';
import type { EatProfile } from '@/db/schema';

function microAmount(age: number, sex: EatProfile['sex'], key: string): number {
  const m = computeMicroTargets(age, sex).find((x) => x.key === key);
  if (!m) throw new Error(`missing micro ${key}`);
  return m.amount;
}

describe('computeBmr — Mifflin–St Jeor', () => {
  it('female: 10·kg + 6.25·cm − 5·age − 161', () => {
    // 10·65 + 6.25·165 − 5·30 − 161 = 650 + 1031.25 − 150 − 161 = 1370.25
    expect(computeBmr(65, 165, 30, 'female')).toBeCloseTo(1370.25, 4);
  });

  it('male: 10·kg + 6.25·cm − 5·age + 5', () => {
    // 10·80 + 6.25·180 − 5·40 + 5 = 800 + 1125 − 200 + 5 = 1730
    expect(computeBmr(80, 180, 40, 'male')).toBeCloseTo(1730, 4);
  });
});

describe('computeTdee', () => {
  it('scales BMR by the activity factor', () => {
    expect(computeTdee(1370.25, 'moderate')).toBeCloseTo(1370.25 * 1.55, 4);
  });

  it('uses the documented activity factors', () => {
    expect(ACTIVITY_FACTORS).toEqual({
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    });
  });
});

describe('computeTargets — full model', () => {
  it('female / moderate: energy + macros against hand-computed references', () => {
    const profile: EatProfile = {
      age: 30,
      sex: 'female',
      weightKg: 65,
      heightCm: 165,
      activity: 'moderate',
      units: 'metric',
      updated_at: 0,
    };
    const t = computeTargets(profile);

    // TDEE = 1370.25 × 1.55 = 2123.8875
    expect(t.energyKcal).toBeCloseTo(2123.8875, 3);
    // Protein 1.6 g/kg = 104 g
    expect(t.protein.grams).toBeCloseTo(104, 6);
    // Fat 30% of energy ÷ 9 = 637.16625 / 9
    expect(t.fat.grams).toBeCloseTo(70.79625, 4);
    // Carbs = remaining kcal ÷ 4
    expect(t.carbs.grams).toBeCloseTo(267.6803125, 4);
  });

  it('male / sedentary: energy + macros against hand-computed references', () => {
    const profile: EatProfile = {
      age: 40,
      sex: 'male',
      weightKg: 80,
      heightCm: 180,
      activity: 'sedentary',
      units: 'imperial',
      updated_at: 0,
    };
    const t = computeTargets(profile);

    // TDEE = 1730 × 1.2 = 2076
    expect(t.energyKcal).toBeCloseTo(2076, 4);
    expect(t.protein.grams).toBeCloseTo(128, 6); // 1.6 × 80
    expect(t.fat.grams).toBeCloseTo(69.2, 4); // 622.8 / 9
    expect(t.carbs.grams).toBeCloseTo(235.3, 4); // 941.2 / 4
  });

  it('macro kcal sum to total energy (no kcal lost)', () => {
    const profile: EatProfile = {
      age: 25,
      sex: 'male',
      weightKg: 75,
      heightCm: 178,
      activity: 'active',
      units: 'metric',
      updated_at: 0,
    };
    const t = computeTargets(profile);
    const macroKcal = t.protein.grams * 4 + t.carbs.grams * 4 + t.fat.grams * 9;
    expect(macroKcal).toBeCloseTo(t.energyKcal, 4);
  });

  it('returns the curated micro panel in order with units', () => {
    const profile: EatProfile = {
      age: 30,
      sex: 'female',
      weightKg: 65,
      heightCm: 165,
      activity: 'moderate',
      units: 'metric',
      updated_at: 0,
    };
    const t = computeTargets(profile);
    expect(t.micros.map((m) => m.key)).toEqual([
      'fiber',
      'sodium',
      'calcium',
      'iron',
      'potassium',
      'vitaminC',
      'vitaminD',
    ]);
    expect(t.micros.find((m) => m.key === 'vitaminD')?.unit).toBe('mcg');
  });
});

describe('computeMicroTargets — sex/age-bracketed DRIs', () => {
  it('female 19–50: fiber 25, calcium 1000, iron 18, potassium 2600, vit C 75, vit D 15', () => {
    expect(microAmount(30, 'female', 'fiber')).toBe(25);
    expect(microAmount(30, 'female', 'calcium')).toBe(1000);
    expect(microAmount(30, 'female', 'iron')).toBe(18);
    expect(microAmount(30, 'female', 'potassium')).toBe(2600);
    expect(microAmount(30, 'female', 'vitaminC')).toBe(75);
    expect(microAmount(30, 'female', 'vitaminD')).toBe(15);
  });

  it('male 19–50: fiber 38, calcium 1000, iron 8, potassium 3400, vit C 90', () => {
    expect(microAmount(40, 'male', 'fiber')).toBe(38);
    expect(microAmount(40, 'male', 'calcium')).toBe(1000);
    expect(microAmount(40, 'male', 'iron')).toBe(8);
    expect(microAmount(40, 'male', 'potassium')).toBe(3400);
    expect(microAmount(40, 'male', 'vitaminC')).toBe(90);
  });

  it('female ≥51: fiber drops to 21, calcium rises to 1200, iron drops to 8', () => {
    expect(microAmount(55, 'female', 'fiber')).toBe(21);
    expect(microAmount(55, 'female', 'calcium')).toBe(1200);
    expect(microAmount(55, 'female', 'iron')).toBe(8);
  });

  it('male ≥51: fiber drops to 30, calcium stays 1000 until 71', () => {
    expect(microAmount(55, 'male', 'fiber')).toBe(30);
    expect(microAmount(55, 'male', 'calcium')).toBe(1000);
  });

  it('≥71: calcium 1200 and vitamin D rises to 20 for both sexes', () => {
    expect(microAmount(75, 'male', 'calcium')).toBe(1200);
    expect(microAmount(75, 'male', 'vitaminD')).toBe(20);
    expect(microAmount(75, 'female', 'vitaminD')).toBe(20);
  });

  it('sodium guidance is a flat 2300 mg for adults', () => {
    expect(microAmount(30, 'female', 'sodium')).toBe(2300);
    expect(microAmount(75, 'male', 'sodium')).toBe(2300);
  });
});
