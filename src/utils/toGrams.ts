/**
 * Pure quantity+unit → grams conversion for nutrition enrichment (Eat tab, Phase
 * 4 — ADR-0027 Spike 2; refined in Phase 4.1). Given an ingredient's stored
 * `{ quantity, unit }`, its `canonical_name` (for a density lookup), the matched
 * FDC food's `foodPortions` (for count/container units), and an optional
 * remembered per-unit weight, it returns a gram weight tagged with which rung of
 * the ladder resolved it — or an explicit `unresolved` so the row prompts the user.
 *
 * Correctness posture (Phase 4.1): the ladder no longer BLOCKS every count/
 * container unit it can't resolve exactly. Instead it may return a coarse curated
 * estimate tagged `source: 'estimate'` — never presented as exact — which the UI
 * badges and the user can correct in one tap. A user's correction is remembered
 * and passed back in as `overrideGramsPerUnit`, resolving with `source: 'override'`
 * ahead of any estimate. The exact rungs (mass, volume→density, nominal, exact FDC
 * portion) are unchanged: a wrong exact weight still corrupts every downstream
 * nutrient, so those never guess. Genuinely unknown units with no portion, no
 * curated default, and no override still return `grams: undefined`.
 *
 * Pure and network-free: no React, no `db/`. The override is passed IN by the
 * caller (the hook resolves it from IndexedDB); this module does no I/O. Shares the
 * unit vocabulary spirit of `measureTokens.ts` but keeps its own conversion factors
 * (those are measure-math, not parsing).
 */

import type { FdcPortion, GramsSource } from '@/db/schema';

export type { GramsSource };

export type GramsResult =
  | { grams: number; source: GramsSource }
  | { grams: undefined; reason: 'unresolved' };

export interface ToGramsInput {
  quantity: number;
  unit: string;
  canonical_name: string;
  foodPortions?: FdcPortion[];
  /**
   * A remembered weight for ONE unit of this ingredient (grams per unit), resolved
   * by the caller from the `eat_portion_overrides` map. When present it outranks
   * both the exact-portion and the curated-estimate rungs (source `'override'`).
   */
  overrideGramsPerUnit?: number;
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

/**
 * Curated per-PIECE weights (grams for a single item) for the common count units
 * `measureTokens` recognizes. Deliberately coarse — a "head" of garlic ≠ a head of
 * cabbage — so these resolve with `source: 'estimate'` (badged + correctable), and
 * an exact FDC portion is always tried first. Sources: USDA "medium" produce
 * weights and typical culinary references. Keyed by the SINGULAR form; plurals are
 * singularized before lookup.
 */
const PER_PIECE_G: Record<string, number> = {
  clove: 3, // garlic clove
  stick: 113, // a US stick of butter
  slice: 25, // sandwich-bread slice
  sprig: 3, // herb sprig
  stalk: 40, // celery stalk
  head: 500, // medium head of lettuce/cabbage (coarse)
  piece: 50, // generic countable piece
  fillet: 140, // fish fillet, ~5 oz
  strip: 20, // bacon strip / pepper strip
  cube: 4, // bouillon cube
  handful: 30, // a loose handful of greens/nuts
  bunch: 150, // a produce/herb bunch (highly variable — coarse)
};

/**
 * Curated per-CONTAINER weights (grams for one packaged unit). Even coarser than
 * per-piece — a can of tomato paste ≠ a can of beans — so likewise `estimate`.
 * Exact FDC portions and remembered overrides both outrank these. Sources: typical
 * US can/jar/package sizes (~14–15 oz standard can).
 */
const CONTAINER_G: Record<string, number> = {
  can: 400,
  jar: 340,
  bottle: 350,
  box: 300,
  bag: 340,
  package: 340,
  pkg: 340,
};

/** Fixed nominal weights so a recipe isn't blocked on a pinch/dash of seasoning. */
const NOMINAL_G: Record<string, number> = {
  pinch: 0.36, pinches: 0.36,
  dash: 0.6, dashes: 0.6,
};

/** Lower-case + strip a trailing period; collapse internal whitespace ("Fl Oz."). */
export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
}

/**
 * Collapse a unit token to its singular form so "bunches"→"bunch",
 * "boxes"→"box", "cloves"→"clove" all match one curated key. Handles the common
 * English `-es` plural (after ch/sh/s/x/z) before the plain `-s`, and leaves
 * `-ss` words and short tokens (`g`, `oz`) untouched.
 */
export function singularizeUnit(unit: string): string {
  const u = normalizeUnit(unit);
  if (/(ch|sh|s|x|z)es$/.test(u)) return u.slice(0, -2);
  if (u.length > 2 && u.endsWith('s') && !u.endsWith('ss')) return u.slice(0, -1);
  return u;
}

/**
 * Stable key for a remembered per-unit weight: `canonical_name|singular-unit`,
 * so "2 Bunches cilantro" and "1 bunch cilantro" share one remembered value. Kept
 * here (next to the resolution logic that consumes it) so the hook and the util
 * never drift on how a key is formed. A bare-count ingredient keys as `name|`.
 */
export function overrideKey(canonicalName: string, unit: string): string {
  return `${canonicalName.trim().toLowerCase()}|${singularizeUnit(unit)}`;
}

/** Find a density for the ingredient name; default to water-like 1.0. */
function densityFor(canonicalName: string): number {
  const name = canonicalName.toLowerCase();
  for (const { match, density } of DENSITIES) {
    if (name.includes(match)) return density;
  }
  return DEFAULT_DENSITY;
}

/** Size modifiers stripped from an FDC portion label before matching its unit. */
const SIZE_MODIFIERS = /\b(extra ?large|x-?large|small|medium|large|jumbo|whole|approx\.?)\b/g;

/** Reduce an FDC portion label to its comparable singular unit words. */
function portionWords(label: string): string[] {
  return label
    .toLowerCase()
    .replace(SIZE_MODIFIERS, ' ')
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeUnit);
}

/** `can`↔`container` and package synonyms treated as interchangeable when matching. */
const CONTAINER_SYNONYMS: Record<string, string[]> = {
  can: ['container', 'tin'],
  container: ['can', 'tin'],
  package: ['pkg', 'container'],
  pkg: ['package', 'container'],
};

/**
 * Resolve grams from the food's FDC portions: find a portion whose (singularized,
 * size-stripped) unit matches the ingredient unit, then scale its `gramWeight`
 * from its own `amount` to the ingredient `quantity`. Fuzzier than a raw substring
 * test — "1 medium onion" matches a bare-count "onion", "cloves" matches "clove",
 * "can" matches "container" — so more rows hit the EXACT portion rung before
 * falling to a curated estimate. Returns undefined when no portion matches.
 */
function fromPortions(quantity: number, unit: string, portions: FdcPortion[]): number | undefined {
  const target = singularizeUnit(unit);
  const synonyms = CONTAINER_SYNONYMS[target] ?? [];
  const match = portions.find((portion) => {
    const words = portionWords(portion.unit);
    if (words.length === 0) return false;
    if (words.includes(target)) return true;
    if (synonyms.some((syn) => words.includes(syn))) return true;
    // Fall back to substring containment for multi-word labels ("slice, thick").
    const joined = words.join(' ');
    return joined.includes(target) || (target.length > 2 && target.includes(joined));
  });
  if (!match || match.gramWeight <= 0) return undefined;
  const perUnit = match.gramWeight / (match.amount > 0 ? match.amount : 1);
  return perUnit * quantity;
}

export function toGrams(input: ToGramsInput): GramsResult {
  const { quantity, canonical_name, foodPortions, overrideGramsPerUnit } = input;
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

  // 4. Remembered override — a user-taught weight for this ingredient+unit beats
  //    every estimate and even an FDC portion (they told us exactly, for this food).
  if (overrideGramsPerUnit !== undefined && overrideGramsPerUnit > 0) {
    return { grams: overrideGramsPerUnit * quantity, source: 'override' };
  }

  const singular = singularizeUnit(unit);

  // 5. Count / container — exact FDC household portion first, then a curated coarse
  //    estimate (badged, correctable), else unresolved → the friendly manual path.
  if (unit.length > 0) {
    if (foodPortions && foodPortions.length > 0) {
      const fromFdc = fromPortions(quantity, unit, foodPortions);
      if (fromFdc !== undefined) return { grams: fromFdc, source: 'portion' };
    }
    if (singular in PER_PIECE_G) {
      return { grams: PER_PIECE_G[singular] * quantity, source: 'estimate' };
    }
    if (singular in CONTAINER_G) {
      return { grams: CONTAINER_G[singular] * quantity, source: 'estimate' };
    }
    return { grams: undefined, reason: 'unresolved' };
  }

  // 6. Bare count (no unit, e.g. "2 eggs"): only resolvable when the food carries a
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
