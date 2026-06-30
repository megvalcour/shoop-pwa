/**
 * Shared measure vocabulary for ingredient parsing. Both `normalizeIngredient`
 * (ADR-0021 — which DISCARDS the leading measure run) and `parseIngredientMeasure`
 * (Phase 3 — which READS it) import these so the two never drift on what counts as
 * a number or a unit. This module is the single source of truth for the regex
 * primitives and the unit set; it holds no behaviour beyond the measure-region
 * normalizer the two parsers share.
 *
 * Pure and network-free: no React, no `db/`.
 */

/** Vulgar-fraction code points, kept as a character class for matching only. */
export const FRAC = `[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]`;

/**
 * A single numeric value, most-specific alternative first: mixed number
 * (`2 1/2`), ascii fraction (`1/2`), integer/decimal with a vulgar fraction
 * suffix (`2½`), a bare vulgar fraction (`½`), or a plain integer/decimal.
 */
export const NUMBER_SRC = [
  `\\d+\\s+\\d+\\s*\\/\\s*\\d+`,
  `\\d+\\s*\\/\\s*\\d+`,
  `\\d+(?:\\.\\d+)?\\s*${FRAC}`,
  FRAC,
  `\\d+(?:\\.\\d+)?`,
].join('|');

/** A range separator between two quantities: `1-2`, `1–2`, `1 to 2`. */
export const RANGE_SEP = `\\s*(?:-|–|—|~|to)\\s*`;

/** Matches a leading quantity expression, optionally a range, at string start. */
export const LEADING_QUANTITY = new RegExp(`^(?:${NUMBER_SRC})(?:${RANGE_SEP}(?:${NUMBER_SRC}))?`);

/** Matches just the FIRST single numeric value at string start (no range tail). */
export const LEADING_NUMBER = new RegExp(`^(?:${NUMBER_SRC})`);

/**
 * Known measurement units (and their common plurals / abbreviations) that may
 * lead an ingredient after the quantity. Lower-cased, trailing periods stripped
 * before lookup. Container words (`can`, `package`, `jar`) are included because
 * recipes count by them ("1 can black beans").
 */
export const UNITS = new Set([
  'cup', 'cups', 'c',
  'tablespoon', 'tablespoons', 'tbsp', 'tbsps', 'tbs', 'tbl',
  'teaspoon', 'teaspoons', 'tsp', 'tsps',
  'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g',
  'kilogram', 'kilograms', 'kg',
  'milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml',
  'liter', 'liters', 'litre', 'litres', 'l',
  'clove', 'cloves',
  'can', 'cans',
  'pinch', 'pinches',
  'dash', 'dashes',
  'package', 'packages', 'pkg', 'pkgs',
  'stick', 'sticks',
  'slice', 'slices',
  'bunch', 'bunches',
  'head', 'heads',
  'sprig', 'sprigs',
  'stalk', 'stalks',
  'quart', 'quarts', 'qt',
  'pint', 'pints', 'pt',
  'gallon', 'gallons', 'gal',
  'handful', 'handfuls',
  'piece', 'pieces',
  'jar', 'jars',
  'bottle', 'bottles',
  'box', 'boxes',
  'bag', 'bags',
  'cube', 'cubes',
  'fillet', 'fillets',
  'strip', 'strips',
]);

/** Ounce-unit tokens, used to recognise the two-word "fl oz". */
export const OUNCE_TOKENS = new Set(['oz', 'ounce', 'ounces']);

/** Lower-case a unit token and drop a trailing period (`Tbsp.` → `tbsp`). */
export function cleanToken(token: string): string {
  return token.replace(/\.$/, '').toLowerCase();
}

/**
 * Normalize the measure region so the spaced / unspaced / glued dual-measure
 * variants collapse into one code path before any unit lookup:
 *   - space out a `/` separator (`cups/70` → `cups / 70`);
 *   - split a number glued to a *known unit* (`100g` → `100 g`, `3.5oz` → `3.5 oz`).
 * The glue split is gated on the trailing letters being a known unit so a
 * name-leading alphanumeric that is *not* a measure (e.g. "7Up") is left intact.
 */
export function normalizeMeasureRegion(s: string): string {
  let out = s.replace(/\s*\/\s*/g, ' / ');
  out = out.replace(/(\d+(?:\.\d+)?)([a-zA-Z]+)/g, (match, num: string, unit: string) =>
    UNITS.has(unit.toLowerCase()) ? `${num} ${unit}` : match,
  );
  return out.replace(/\s+/g, ' ').trim();
}
