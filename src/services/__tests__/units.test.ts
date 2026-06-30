import { describe, it, expect } from 'vitest';
import { cmToFtIn, cmToIn, ftInToCm, inToCm, kgToLb, lbToKg } from '@/services/units';

describe('units — weight', () => {
  it('converts kg → lb against a known value', () => {
    expect(kgToLb(70)).toBeCloseTo(154.3236, 3);
  });

  it('converts lb → kg against a known value', () => {
    expect(lbToKg(154)).toBeCloseTo(69.8532, 3);
  });

  it('round-trips kg → lb → kg without drift', () => {
    expect(lbToKg(kgToLb(82.5))).toBeCloseTo(82.5, 6);
  });
});

describe('units — length', () => {
  it('converts inches → cm exactly (2.54 cm/in)', () => {
    expect(inToCm(10)).toBeCloseTo(25.4, 6);
  });

  it('converts cm → inches against a known value', () => {
    expect(cmToIn(175)).toBeCloseTo(68.8976, 3);
  });

  it('converts ft+in → cm', () => {
    // 5 ft 9 in = 69 in = 175.26 cm
    expect(ftInToCm(5, 9)).toBeCloseTo(175.26, 6);
  });

  it('converts cm → ft+in with nearest-inch rounding', () => {
    expect(cmToFtIn(175)).toEqual({ feet: 5, inches: 9 });
  });

  it('carries a rounded inch into the next foot at a boundary', () => {
    // 182.7 cm → 71.93 in → rounds to 72 in → exactly 6 ft 0 in.
    expect(cmToFtIn(182.7)).toEqual({ feet: 6, inches: 0 });
  });

  it('round-trips cm → ft+in → cm to the nearest inch', () => {
    const { feet, inches } = cmToFtIn(180);
    expect(ftInToCm(feet, inches)).toBeCloseTo(180.34, 2); // 71 in
  });
});
