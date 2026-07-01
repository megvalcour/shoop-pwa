import { describe, it, expect } from 'vitest';
import {
  toGrams,
  overrideKey,
  singularizeUnit,
  type GramsResult,
  type GramsSource,
} from '@/utils/toGrams';
import type { FdcPortion } from '@/db/schema';

/** Narrow a result to a resolved one, failing the test if it is unresolved. */
function resolved(result: GramsResult): { grams: number; source: GramsSource } {
  if (result.grams === undefined) throw new Error('expected resolved grams, got unresolved');
  return result;
}

describe('toGrams — mass', () => {
  it('converts the static mass table (and plurals/aliases) exactly', () => {
    expect(toGrams({ quantity: 100, unit: 'g', canonical_name: 'flour' })).toEqual({
      grams: 100,
      source: 'mass',
    });
    expect(toGrams({ quantity: 2, unit: 'kg', canonical_name: 'beef' })).toEqual({
      grams: 2000,
      source: 'mass',
    });
    const oz = resolved(toGrams({ quantity: 1, unit: 'oz', canonical_name: 'cheese' }));
    expect(oz.source).toBe('mass');
    expect(oz.grams).toBeCloseTo(28.35, 1);
    const lbs = resolved(toGrams({ quantity: 2, unit: 'lbs', canonical_name: 'chicken' }));
    expect(lbs.grams).toBeCloseTo(907.18, 1);
  });

  it('is case- and period-insensitive on the unit', () => {
    expect(resolved(toGrams({ quantity: 5, unit: 'G.', canonical_name: 'salt' })).grams).toBe(5);
  });
});

describe('toGrams — volume × density', () => {
  it('uses the curated density for a known ingredient', () => {
    // 1 cup flour = 236.588 ml × 0.53 ≈ 125.4 g
    const flour = resolved(toGrams({ quantity: 1, unit: 'cup', canonical_name: 'all-purpose flour' }));
    expect(flour.source).toBe('density');
    expect(flour.grams).toBeCloseTo(125.4, 0);
  });

  it('uses the water-like default density for an unknown ingredient', () => {
    // 1 cup of something unknown ≈ 236.588 ml × 1.0
    const unknown = resolved(toGrams({ quantity: 1, unit: 'cup', canonical_name: 'mystery mush' }));
    expect(unknown.source).toBe('density');
    expect(unknown.grams).toBeCloseTo(236.588, 1);
  });

  it('handles small volume units and fl oz', () => {
    expect(
      resolved(toGrams({ quantity: 1, unit: 'tbsp', canonical_name: 'oil' })).grams,
    ).toBeCloseTo(14.7868 * 0.92, 2);
    expect(
      resolved(toGrams({ quantity: 1, unit: 'fl oz', canonical_name: 'milk' })).grams,
    ).toBeCloseTo(29.5735 * 1.03, 2);
  });
});

describe('toGrams — count / container via FDC portions', () => {
  const portions: FdcPortion[] = [
    { unit: 'clove', gramWeight: 3, amount: 1 },
    { unit: 'cup', gramWeight: 160, amount: 1 },
  ];

  it('scales an FDC portion gram weight by the quantity', () => {
    const r = toGrams({ quantity: 4, unit: 'clove', canonical_name: 'garlic', foodPortions: portions });
    expect(r).toEqual({ grams: 12, source: 'portion' });
  });

  it('matches a portion when the unit is contained in the portion label', () => {
    const slicePortions: FdcPortion[] = [{ unit: 'slice, thick', gramWeight: 30, amount: 1 }];
    const r = toGrams({
      quantity: 2,
      unit: 'slice',
      canonical_name: 'bread',
      foodPortions: slicePortions,
    });
    expect(r).toEqual({ grams: 60, source: 'portion' });
  });

  it('falls back to the curated per-piece estimate when FDC has no matching portion', () => {
    const r = toGrams({ quantity: 3, unit: 'clove', canonical_name: 'garlic' });
    expect(r).toEqual({ grams: 9, source: 'estimate' });
  });

  it('matches a plural ingredient unit against a singular FDC portion label', () => {
    const clovePortions: FdcPortion[] = [{ unit: 'clove', gramWeight: 3, amount: 1 }];
    const r = toGrams({ quantity: 4, unit: 'cloves', canonical_name: 'garlic', foodPortions: clovePortions });
    expect(r).toEqual({ grams: 12, source: 'portion' });
  });

  it('strips a size modifier so a "medium" portion matches a bare-count unit', () => {
    const onionPortions: FdcPortion[] = [{ unit: 'medium onion', gramWeight: 110, amount: 1 }];
    const r = toGrams({ quantity: 2, unit: 'onion', canonical_name: 'onion', foodPortions: onionPortions });
    expect(r).toEqual({ grams: 220, source: 'portion' });
  });

  it('treats a can as a container so a "container" portion matches', () => {
    const beanPortions: FdcPortion[] = [{ unit: 'container', gramWeight: 425, amount: 1 }];
    const r = toGrams({ quantity: 1, unit: 'can', canonical_name: 'black beans', foodPortions: beanPortions });
    expect(r).toEqual({ grams: 425, source: 'portion' });
  });
});

describe('toGrams — curated estimates (count / container)', () => {
  it('resolves widened count units to a labeled estimate, not unresolved', () => {
    expect(toGrams({ quantity: 2, unit: 'bunch', canonical_name: 'cilantro' })).toEqual({
      grams: 300,
      source: 'estimate',
    });
    expect(toGrams({ quantity: 3, unit: 'sprigs', canonical_name: 'thyme' })).toEqual({
      grams: 9,
      source: 'estimate',
    });
    expect(toGrams({ quantity: 1, unit: 'head', canonical_name: 'lettuce' })).toEqual({
      grams: 500,
      source: 'estimate',
    });
  });

  it('resolves container units to a labeled estimate', () => {
    expect(toGrams({ quantity: 2, unit: 'cans', canonical_name: 'tomatoes' })).toEqual({
      grams: 800,
      source: 'estimate',
    });
    expect(toGrams({ quantity: 1, unit: 'jar', canonical_name: 'salsa' })).toEqual({
      grams: 340,
      source: 'estimate',
    });
  });

  it('prefers an exact FDC portion over the curated estimate', () => {
    const portions: FdcPortion[] = [{ unit: 'bunch', gramWeight: 25, amount: 1 }];
    const r = toGrams({ quantity: 1, unit: 'bunch', canonical_name: 'parsley', foodPortions: portions });
    expect(r).toEqual({ grams: 25, source: 'portion' });
  });
});

describe('toGrams — remembered override', () => {
  it('uses the remembered per-unit weight, tagged override, over an estimate', () => {
    const r = toGrams({
      quantity: 2,
      unit: 'bunch',
      canonical_name: 'cilantro',
      overrideGramsPerUnit: 23,
    });
    expect(r).toEqual({ grams: 46, source: 'override' });
  });

  it('lets an override beat an exact FDC portion', () => {
    const portions: FdcPortion[] = [{ unit: 'bunch', gramWeight: 25, amount: 1 }];
    const r = toGrams({
      quantity: 1,
      unit: 'bunch',
      canonical_name: 'parsley',
      foodPortions: portions,
      overrideGramsPerUnit: 40,
    });
    expect(r).toEqual({ grams: 40, source: 'override' });
  });

  it('ignores a non-positive override and falls back to the estimate', () => {
    const r = toGrams({ quantity: 1, unit: 'bunch', canonical_name: 'cilantro', overrideGramsPerUnit: 0 });
    expect(r).toEqual({ grams: 150, source: 'estimate' });
  });

  it('does not let a mass/volume unit be overridden — exact rungs win', () => {
    const mass = toGrams({ quantity: 100, unit: 'g', canonical_name: 'flour', overrideGramsPerUnit: 999 });
    expect(mass).toEqual({ grams: 100, source: 'mass' });
  });
});

describe('overrideKey / singularizeUnit', () => {
  it('singularizes -s and -es plurals but leaves short/`-ss` tokens', () => {
    expect(singularizeUnit('bunches')).toBe('bunch');
    expect(singularizeUnit('boxes')).toBe('box');
    expect(singularizeUnit('cloves')).toBe('clove');
    expect(singularizeUnit('Cups')).toBe('cup');
    expect(singularizeUnit('oz')).toBe('oz');
    expect(singularizeUnit('g')).toBe('g');
  });

  it('collapses case + plural into one stable key', () => {
    expect(overrideKey('Cilantro', 'Bunches')).toBe('cilantro|bunch');
    expect(overrideKey('cilantro', 'bunch')).toBe('cilantro|bunch');
    expect(overrideKey('egg', '')).toBe('egg|');
  });
});

describe('toGrams — nominal pinch/dash', () => {
  it('resolves a pinch/dash to a fixed nominal weight without FDC', () => {
    expect(toGrams({ quantity: 1, unit: 'pinch', canonical_name: 'salt' })).toEqual({
      grams: 0.36,
      source: 'nominal',
    });
    expect(toGrams({ quantity: 2, unit: 'dash', canonical_name: 'hot sauce' })).toEqual({
      grams: 1.2,
      source: 'nominal',
    });
  });
});

describe('toGrams — bare count (no unit)', () => {
  it('uses a whole-piece FDC portion when present', () => {
    const eggPortions: FdcPortion[] = [{ unit: 'large', gramWeight: 50, amount: 1 }];
    // "large" is not a whole/each token, so this stays unresolved (never guessed).
    expect(toGrams({ quantity: 2, unit: '', canonical_name: 'egg', foodPortions: eggPortions })).toEqual(
      { grams: undefined, reason: 'unresolved' },
    );

    const wholePortions: FdcPortion[] = [{ unit: 'fruit, without skin', gramWeight: 120, amount: 1 }];
    expect(
      toGrams({ quantity: 2, unit: '', canonical_name: 'banana', foodPortions: wholePortions }),
    ).toEqual({ grams: 240, source: 'portion' });
  });

  it('is unresolved with no unit and no portions', () => {
    expect(toGrams({ quantity: 2, unit: '', canonical_name: 'egg' })).toEqual({
      grams: undefined,
      reason: 'unresolved',
    });
  });
});

describe('toGrams — unresolved', () => {
  it('returns unresolved for an unknown unit with no portion, estimate, or override', () => {
    expect(toGrams({ quantity: 1, unit: 'glug', canonical_name: 'olive oil' })).toEqual({
      grams: undefined,
      reason: 'unresolved',
    });
  });

  it('falls through a non-matching portion to the curated estimate for a known unit', () => {
    // 'cup' portion doesn't match 'sprig', but 'sprig' is now a curated estimate.
    const portions: FdcPortion[] = [{ unit: 'cup', gramWeight: 160, amount: 1 }];
    expect(
      toGrams({ quantity: 1, unit: 'sprig', canonical_name: 'thyme', foodPortions: portions }),
    ).toEqual({ grams: 3, source: 'estimate' });
  });

  it('stays unresolved for an unknown unit even when the food carries portions', () => {
    const portions: FdcPortion[] = [{ unit: 'cup', gramWeight: 160, amount: 1 }];
    expect(
      toGrams({ quantity: 1, unit: 'glug', canonical_name: 'olive oil', foodPortions: portions }),
    ).toEqual({ grams: undefined, reason: 'unresolved' });
  });
});
