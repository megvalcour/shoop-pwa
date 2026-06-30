import { describe, it, expect } from 'vitest';
import { toGrams, type GramsResult, type GramsSource } from '@/utils/toGrams';
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

  it('falls back to the per-piece table when FDC has no matching portion', () => {
    const r = toGrams({ quantity: 3, unit: 'clove', canonical_name: 'garlic' });
    expect(r).toEqual({ grams: 9, source: 'portion' });
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
  it('returns unresolved for an unknown unit with no portion', () => {
    expect(toGrams({ quantity: 1, unit: 'glug', canonical_name: 'olive oil' })).toEqual({
      grams: undefined,
      reason: 'unresolved',
    });
  });

  it('does not match a non-existent portion unit', () => {
    const portions: FdcPortion[] = [{ unit: 'cup', gramWeight: 160, amount: 1 }];
    expect(
      toGrams({ quantity: 1, unit: 'sprig', canonical_name: 'thyme', foodPortions: portions }),
    ).toEqual({ grams: undefined, reason: 'unresolved' });
  });
});
