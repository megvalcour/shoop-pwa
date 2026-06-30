/**
 * Pure quantity+unit → grams conversion for nutrition enrichment (Eat tab, Phase
 * 4 — ADR-0027 Spike 2). Given an ingredient's stored `{ quantity, unit }`, its
 * `canonical_name` (for a density lookup), and the matched FDC food's
 * `foodPortions` (for count/container units), it returns a gram weight tagged with
 * which rung of the ladder resolved it — or an explicit `unresolved` so the row
 * prompts a manual gram entry rather than inventing a number.
 *
 * The unresolved path is the load-bearing correctness guarantee: a wrong density
 * or a silently-invented weight corrupts every downstream nutrient, so anything
 * the ladder can't resolve confidently returns `grams: undefined`.
 *
 * Pure and network-free: no React, no `db/`. Shares the unit vocabulary spirit of
 * `measureTokens.ts` but keeps its own conversion factors (those are measure-math,
 * not parsing).
 */

import type { FdcPortion } from '@/db/schema';

export type GramsSource = 'mass' | 'density' | 'portion' | 'nominal';

export type GramsResult =
  | { grams: number; source: GramsSource }
  | { grams: undefined; reason: 'unresolved' };

export interface ToGramsInput {
  quantity: number;
  unit: string;
  canonical_name: string;
  foodPortions?: FdcPortion[];
}

/** Mass units → grams. Static and exact (NIST conversions). */
const MASS_G: Record<string, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
};

/** Volume units → millilitres. Static (US customary). `fl oz` handled as a key. */
const VOLUME_ML: Record<string, number> = {
  cup: 236.588, cups: 236.588, c: 236.588,
  tablespoon: 14.7868, tablespoons: 14.7868, tbsp: 14.7868, tbsps: 14.7868, tbs: 14.7868, tbl: 14.7868,
  teaspoon: 4.92892, teaspoons: 4.92892, tsp: 4.92892, tsps: 4.92892,
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1,
  l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
  pint: 473.176, pints: 473.176, pt: 473.176,
  quart: 946.353, quarts: 946.353, qt: 946.353,
  gallon: 3785.41, gallons: 3785.41, gal: 3785.41,
  'fl oz': 29.5735,
};

/**
 * Coarse ingredient densities (g/ml) for the volume→mass step, keyed by a
 * substring of `canonical_name`. Approximate by nature — a cup of flour varies
 * with packing — so these are deliberately a SMALL curated v1 set; anything not
 * matched uses the water-like 1.0 default, and the `density` source tag marks the
 * estimate. Sources: USDA / King Arthur Baking ingredient-weight references.
 */
const DENSITIES: Array<{ match: string; density: number }> = [
  { match: 'flour', density: 0.53 },
  { match: 'brown sugar', density: 0.9 },
  { match: 'powdered sugar', density: 0.56 },
  { match: 'sugar', density: 0.85 },
  { match: 'honey', density: 1.42 },
  { match: 'syrup', density: 1.37 },
  { match: 'butter', density: 0.96 },
  { match: 'oil', density: 0.92 },
  { match: 'milk', density: 1.03 },
  { match: 'cream', density: 1.01 },
  { match: 'yogurt', density: 1.03 },
  { match: 'water', density: 1.0 },
  { match: 'broth', density: 1.0 },
  { match: 'stock', density: 1.0 },
  { match: 'juice', density: 1.04 },
  { match: 'salt', density: 1.2 },
];
const DEFAULT_DENSITY = 1.0;

/** Tiny per-piece fallback for the most common count units when FDC has no portion. */
const PER_PIECE_G: Record<string, number> = {
  clove: 3, cloves: 3,
  stick: 113, sticks: 113, // a US stick of butter
  slice: 25, slices: 25,
};

/** Fixed nominal weights so a recipe isn't blocked on a pinch/dash of seasoning. */
const NOMINAL_G: Record<string, number> = {
  pinch: 0.36, pinches: 0.36,
  dash: 0.6, dashes: 0.6,
};

/** Lower-case + strip a trailing period; collapse internal whitespace ("Fl Oz."). */
function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
}

/** Find a density for the ingredient name; default to water-like 1.0. */
function densityFor(canonicalName: string): number {
  const name = canonicalName.toLowerCase();
  for (const { match, density } of DENSITIES) {
    if (name.includes(match)) return density;
  }
  return DEFAULT_DENSITY;
}

/**
 * Resolve grams from the food's FDC portions: find a portion whose `unit`
 * contains (or is contained by) the ingredient unit token, then scale its
 * `gramWeight` from its own `amount` to the ingredient `quantity`. Returns
 * undefined when no portion matches.
 */
function fromPortions(quantity: number, unit: string, portions: FdcPortion[]): number | undefined {
  const match = portions.find((portion) => {
    const pUnit = portion.unit.toLowerCase();
    return pUnit === unit || pUnit.includes(unit) || unit.includes(pUnit);
  });
  if (!match || match.gramWeight <= 0) return undefined;
  const perUnit = match.gramWeight / (match.amount > 0 ? match.amount : 1);
  return perUnit * quantity;
}

export function toGrams(input: ToGramsInput): GramsResult {
  const { quantity, canonical_name, foodPortions } = input;
  const unit = normalizeUnit(input.unit);

  // 1. Mass — deterministic, exact.
  if (unit in MASS_G) {
    return { grams: MASS_G[unit] * quantity, source: 'mass' };
  }

  // 2. Volume → ml → g via the curated density table.
  if (unit in VOLUME_ML) {
    const ml = VOLUME_ML[unit] * quantity;
    return { grams: ml * densityFor(canonical_name), source: 'density' };
  }

  // 3. Pinch/dash nominal — before the portion path so they never depend on FDC.
  if (unit in NOMINAL_G) {
    return { grams: NOMINAL_G[unit] * quantity, source: 'nominal' };
  }

  // 4. Count / container — FDC household portions first, then the per-piece table.
  if (unit.length > 0) {
    if (foodPortions && foodPortions.length > 0) {
      const fromFdc = fromPortions(quantity, unit, foodPortions);
      if (fromFdc !== undefined) return { grams: fromFdc, source: 'portion' };
    }
    if (unit in PER_PIECE_G) {
      return { grams: PER_PIECE_G[unit] * quantity, source: 'portion' };
    }
    return { grams: undefined, reason: 'unresolved' };
  }

  // 5. Bare count (no unit, e.g. "2 eggs"): only resolvable when the food carries a
  //    whole-piece portion; otherwise unresolved → manual entry. Never guessed.
  if (foodPortions && foodPortions.length > 0) {
    const whole = foodPortions.find((portion) =>
      /\b(each|whole|fruit|piece|unit)\b/.test(portion.unit.toLowerCase()),
    );
    if (whole && whole.gramWeight > 0) {
      const perUnit = whole.gramWeight / (whole.amount > 0 ? whole.amount : 1);
      return { grams: perUnit * quantity, source: 'portion' };
    }
  }

  return { grams: undefined, reason: 'unresolved' };
}
