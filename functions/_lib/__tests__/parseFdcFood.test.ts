import { describe, it, expect } from 'vitest';
import { parseFdcFood } from '../parseFdcFood';

/**
 * Captured-shape FDC fixtures. The numbers are illustrative but the STRUCTURE
 * mirrors the three datasets `/api/nutrition` queries — Foundation / SR Legacy
 * (nested `{ nutrient: { id }, amount }`, rich `foodPortions`) and Branded
 * (same nutrient shape, often no portions). Amounts are per 100 g.
 */

// Foundation-style: nested nutrient ids, household portions present.
const FOUNDATION_FOOD = {
  fdcId: 169967,
  description: 'Onions, raw',
  dataType: 'Foundation',
  foodNutrients: [
    { nutrient: { id: 1008, name: 'Energy', unitName: 'KCAL' }, amount: 40 },
    { nutrient: { id: 1003, name: 'Protein', unitName: 'G' }, amount: 1.1 },
    { nutrient: { id: 1004, name: 'Total lipid (fat)', unitName: 'G' }, amount: 0.1 },
    { nutrient: { id: 1005, name: 'Carbohydrate, by difference', unitName: 'G' }, amount: 9.34 },
    { nutrient: { id: 1079, name: 'Fiber, total dietary', unitName: 'G' }, amount: 1.7 },
    { nutrient: { id: 1093, name: 'Sodium, Na', unitName: 'MG' }, amount: 4 },
    { nutrient: { id: 1087, name: 'Calcium, Ca', unitName: 'MG' }, amount: 23 },
    { nutrient: { id: 1089, name: 'Iron, Fe', unitName: 'MG' }, amount: 0.21 },
    { nutrient: { id: 1092, name: 'Potassium, K', unitName: 'MG' }, amount: 146 },
    { nutrient: { id: 1162, name: 'Vitamin C', unitName: 'MG' }, amount: 7.4 },
    { nutrient: { id: 1114, name: 'Vitamin D (D2 + D3)', unitName: 'UG' }, amount: 0 },
    // Noise the parser must ignore: a kJ energy and an unrelated nutrient.
    { nutrient: { id: 1062, name: 'Energy', unitName: 'kJ' }, amount: 166 },
    { nutrient: { id: 1253, name: 'Cholesterol', unitName: 'MG' }, amount: 0 },
  ],
  foodPortions: [
    { amount: 1, gramWeight: 110, modifier: 'medium', measureUnit: { name: 'undetermined' } },
    { amount: 1, gramWeight: 160, modifier: 'cup, chopped', measureUnit: { name: 'cup' } },
  ],
};

// SR Legacy-style with an abridged (flat) nutrient encoding and no id-1008 energy
// — only an Atwater KCAL energy — to exercise the unit fallback + flat reader.
const SR_LEGACY_FOOD = {
  fdcId: '171705',
  description: 'Garlic, raw',
  dataType: 'SR Legacy',
  foodNutrients: [
    { nutrientId: 2047, nutrientName: 'Energy (Atwater General)', unitName: 'KCAL', value: 149 },
    { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 6.36 },
    { nutrientId: 1004, nutrientName: 'Total lipid (fat)', unitName: 'G', value: 0.5 },
    { nutrientId: 1005, nutrientName: 'Carbohydrate', unitName: 'G', value: 33.06 },
    { nutrientId: 1093, nutrientName: 'Sodium, Na', unitName: 'MG', value: 17 },
  ],
  foodPortions: [{ amount: 1, gramWeight: 3, modifier: 'clove', measureUnit: { name: 'undetermined' } }],
};

// Branded-style: nested nutrient ids, no household portions.
const BRANDED_FOOD = {
  fdcId: 534358,
  description: 'ALL-PURPOSE FLOUR',
  dataType: 'Branded',
  foodNutrients: [
    { nutrient: { id: 1008, name: 'Energy', unitName: 'KCAL' }, amount: 364 },
    { nutrient: { id: 1003, name: 'Protein', unitName: 'G' }, amount: 10 },
    { nutrient: { id: 1005, name: 'Carbohydrate', unitName: 'G' }, amount: 76.7 },
    { nutrient: { id: 1089, name: 'Iron, Fe', unitName: 'MG' }, amount: 4.4 },
  ],
};

describe('parseFdcFood', () => {
  it('maps a Foundation food: nested ids, full panel, household portions', () => {
    const panel = parseFdcFood(FOUNDATION_FOOD);
    expect(panel).not.toBeNull();
    expect(panel!.fdc_id).toBe('169967');
    expect(panel!.description).toBe('Onions, raw');
    expect(panel!.per100g).toEqual({
      energyKcal: 40,
      protein: 1.1,
      fat: 0.1,
      carbs: 9.34,
      fiber: 1.7,
      sodium: 4,
      calcium: 23,
      iron: 0.21,
      potassium: 146,
      vitaminC: 7.4,
      vitaminD: 0,
    });
    // The "undetermined" measure unit falls back to the modifier; "cup" wins by name.
    expect(panel!.foodPortions).toEqual([
      { unit: 'medium', gramWeight: 110, amount: 1 },
      { unit: 'cup', gramWeight: 160, amount: 1 },
    ]);
  });

  it('maps an SR Legacy food: flat encoding + KCAL-unit energy fallback', () => {
    const panel = parseFdcFood(SR_LEGACY_FOOD);
    expect(panel).not.toBeNull();
    expect(panel!.fdc_id).toBe('171705');
    // No id-1008 row, but the Atwater KCAL energy is picked up by the unit fallback.
    expect(panel!.per100g.energyKcal).toBe(149);
    expect(panel!.per100g.protein).toBe(6.36);
    expect(panel!.per100g.sodium).toBe(17);
    // Absent nutrients default to 0.
    expect(panel!.per100g.fiber).toBe(0);
    expect(panel!.per100g.calcium).toBe(0);
    expect(panel!.foodPortions).toEqual([{ unit: 'clove', gramWeight: 3, amount: 1 }]);
  });

  it('maps a Branded food with no portions: omits foodPortions', () => {
    const panel = parseFdcFood(BRANDED_FOOD);
    expect(panel).not.toBeNull();
    expect(panel!.per100g.energyKcal).toBe(364);
    expect(panel!.per100g.protein).toBe(10);
    expect(panel!.per100g.iron).toBe(4.4);
    expect(panel!.foodPortions).toBeUndefined();
  });

  it('returns null for input with no usable fdcId', () => {
    expect(parseFdcFood(null)).toBeNull();
    expect(parseFdcFood({})).toBeNull();
    expect(parseFdcFood({ description: 'x' })).toBeNull();
    expect(parseFdcFood('not an object')).toBeNull();
  });
});
