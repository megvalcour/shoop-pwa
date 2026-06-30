/**
 * Pure unit-conversion helpers for the Eat profile form (Phase 2). The stored
 * profile is always metric-canonical (kg, cm); these convert only at the UI edge
 * so toggling the display system never erodes the stored value. No I/O, no React.
 *
 * Conversion constants are the exact international definitions:
 *   1 lb = 0.45359237 kg, 1 in = 2.54 cm, 1 ft = 12 in.
 */

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const IN_PER_FT = 12;

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

/** Combined feet + inches → centimetres. */
export function ftInToCm(feet: number, inches: number): number {
  return inToCm(feet * IN_PER_FT + inches);
}

/**
 * Centimetres → whole feet + remaining inches. The total inches are rounded to
 * the nearest whole inch first, so any carry into the next foot happens before
 * the split; the result is always a clean `{ feet, inches }` with `0 <= inches < 12`.
 */
export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cmToIn(cm));
  return {
    feet: Math.floor(totalInches / IN_PER_FT),
    inches: totalInches % IN_PER_FT,
  };
}
