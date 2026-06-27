/**
 * Pure, network-free normalization of a raw recipe ingredient string into an
 * addable grocery item. Raw `recipeIngredient` strings look like
 * `"2 cups all-purpose flour, sifted"`; added verbatim they classify poorly in
 * the aisle matcher and read badly on a list. This strips the leading quantity
 * and unit, drops parentheticals and trailing prep clauses, and keeps the
 * cleaned noun phrase as `name`.
 *
 * It is deliberately **conservative**: when it can't confidently isolate a noun
 * phrase it falls back to the raw string. A slightly-wordy item ("Salt and
 * pepper to taste") beats a wrong one ("pepper to taste"). The original `raw`
 * is always preserved for display/tooltip.
 */

export interface NormalizedIngredient {
  /** Cleaned noun phrase suitable for `items.name`. */
  name: string;
  /** Parsed leading quantity, when present and numeric. */
  quantity?: number;
  /** Leading unit token, when one from the known set was stripped. */
  unit?: string;
  /** The original, untouched ingredient string. */
  raw: string;
}

/** Vulgar-fraction code points → their decimal value. */
const VULGAR_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅐': 1 / 7,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
  '⅑': 1 / 9,
  '⅒': 1 / 10,
};

const FRAC = `[${Object.keys(VULGAR_FRACTIONS).join('')}]`;

/**
 * A single numeric value, most-specific alternative first: mixed number
 * (`2 1/2`), ascii fraction (`1/2`), integer/decimal with a vulgar fraction
 * suffix (`2½`), a bare vulgar fraction (`½`), or a plain integer/decimal.
 */
const NUMBER_SRC = [
  `\\d+\\s+\\d+\\s*\\/\\s*\\d+`,
  `\\d+\\s*\\/\\s*\\d+`,
  `\\d+(?:\\.\\d+)?\\s*${FRAC}`,
  FRAC,
  `\\d+(?:\\.\\d+)?`,
].join('|');

/** A range separator between two quantities: `1-2`, `1–2`, `1 to 2`. */
const RANGE_SEP = `\\s*(?:-|–|—|~|to)\\s*`;

/** Matches a leading quantity expression, optionally a range, at string start. */
const LEADING_QUANTITY = new RegExp(`^(${NUMBER_SRC})(?:${RANGE_SEP}(?:${NUMBER_SRC}))?`);

/**
 * Known measurement units (and their common plurals / abbreviations) that may
 * lead an ingredient after the quantity. Lower-cased, trailing periods stripped
 * before lookup. Container words (`can`, `package`, `jar`) are included because
 * recipes count by them ("1 can black beans").
 */
const UNITS = new Set([
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
const OUNCE_TOKENS = new Set(['oz', 'ounce', 'ounces']);

/**
 * Leading *size* descriptors that read better as a trailing parenthetical than as
 * part of the noun ("medium tomatoes" → "tomatoes (medium)"). Deliberately size
 * only — not prep/quality words — so integral names ("baby back ribs") are the
 * one acceptable edge, not the rule. The two-token "extra large" / hyphenated
 * "extra-large" form is handled separately and normalised to `extra-large`.
 */
const SIZE_DESCRIPTORS = new Set(['small', 'medium', 'large', 'jumbo', 'baby']);

/** Round to 3 decimals so `1/3` reads as `0.333`, not float noise. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Parse a single matched number token (no ranges) into its decimal value. */
function parseNumberToken(token: string): number | undefined {
  const t = token.trim();

  // Integer/decimal with a vulgar-fraction suffix, or a bare vulgar fraction.
  const fracSuffix = t.match(new RegExp(`^(\\d+(?:\\.\\d+)?)?\\s*(${FRAC})$`));
  if (fracSuffix) {
    const whole = fracSuffix[1] ? Number(fracSuffix[1]) : 0;
    return round3(whole + VULGAR_FRACTIONS[fracSuffix[2]]);
  }

  // Mixed number: "2 1/2".
  const mixed = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const denom = Number(mixed[3]);
    if (denom === 0) return undefined;
    return round3(Number(mixed[1]) + Number(mixed[2]) / denom);
  }

  // Simple fraction: "1/2".
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const denom = Number(frac[2]);
    if (denom === 0) return undefined;
    return round3(Number(frac[1]) / denom);
  }

  // Plain integer or decimal.
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);

  return undefined;
}

/** Strip a leading quantity (or range); returns its value plus the remainder. */
function stripLeadingQuantity(s: string): { quantity?: number; rest: string } {
  const match = s.match(LEADING_QUANTITY);
  if (!match) return { rest: s };
  return { quantity: parseNumberToken(match[1]), rest: s.slice(match[0].length) };
}

/** Lower-case a unit token and drop a trailing period (`Tbsp.` → `tbsp`). */
function cleanToken(token: string): string {
  return token.replace(/\.$/, '').toLowerCase();
}

/** Strip a leading known unit token; returns the unit plus the remainder. */
function stripLeadingUnit(s: string): { unit?: string; rest: string } {
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { rest: s };

  const first = cleanToken(tokens[0]);

  // Two-word "fl oz" / "fluid ounce".
  if (first === 'fl' && tokens[1] && OUNCE_TOKENS.has(cleanToken(tokens[1]))) {
    if (tokens.length > 2) return { unit: 'fl oz', rest: tokens.slice(2).join(' ') };
    return { rest: s }; // would empty the name — leave it intact
  }

  // Only strip when a noun phrase remains, so a bare "cups" never empties out.
  if (UNITS.has(first) && tokens.length > 1) {
    return { unit: first, rest: tokens.slice(1).join(' ') };
  }

  return { rest: s };
}

/**
 * Lift a single leading size descriptor out of the noun phrase, returning the
 * lower-cased descriptor plus the remainder. Only the leading run, only one
 * descriptor, and never when removing it would empty the name (a bare "large"
 * stays). The descriptor is returned in our own normalised casing, so the
 * eventual parenthetical is always lower-cased regardless of source casing.
 */
function stripLeadingSize(s: string): { descriptor?: string; rest: string } {
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { rest: s };

  const first = tokens[0].toLowerCase();

  // Two-word "extra large" or hyphenated "extra-large", normalised to one token.
  if (first === 'extra' && tokens[1] && tokens[1].toLowerCase() === 'large') {
    if (tokens.length > 2) return { descriptor: 'extra-large', rest: tokens.slice(2).join(' ') };
    return { rest: s }; // would empty the name — leave it intact
  }
  if (first === 'extra-large') {
    if (tokens.length > 1) return { descriptor: 'extra-large', rest: tokens.slice(1).join(' ') };
    return { rest: s };
  }

  // Only strip when a noun phrase remains, so a bare "large" never empties out.
  if (SIZE_DESCRIPTORS.has(first) && tokens.length > 1) {
    return { descriptor: first, rest: tokens.slice(1).join(' ') };
  }

  return { rest: s };
}

/**
 * Sentence-case: uppercase the first alphabetic character, leave the rest as
 * written so proper nouns survive ("grated Parmesan" → "Grated Parmesan"). The
 * dedup canonical name is lower-cased downstream, so casing never breaks merges.
 */
function sentenceCase(s: string): string {
  return s.replace(/[a-z]/i, (ch) => ch.toUpperCase());
}

export function normalizeIngredient(raw: string): NormalizedIngredient {
  let work = raw.trim();

  // Leading list-marker glyphs some sites embed (bullets, checkboxes, dashes).
  work = work.replace(/^[\s\-•*▢▪◦·–—]+/, '');

  // Parenthetical asides are almost always size/conversion notes ("(14.5 oz)").
  work = work.replace(/\([^)]*\)/g, ' ');

  // A trailing prep clause ("..., chopped") follows the first comma/semicolon.
  const clauseStart = work.search(/[,;]/);
  if (clauseStart >= 0) work = work.slice(0, clauseStart);

  work = work.replace(/\s+/g, ' ').trim();

  const { quantity, rest: afterQty } = stripLeadingQuantity(work);
  let rest = afterQty.trim();

  // A leading article often precedes a unit ("a pinch of salt").
  rest = rest.replace(/^(?:an?)\s+/i, '');

  // Lift a leading size descriptor into a trailing parenthetical. This runs
  // *before* the unit strip so a descriptor that precedes a container unit
  // ("large can of tomatoes") still resolves to the bare noun ("tomatoes
  // (large)") rather than stranding "can of …" in the name.
  const { descriptor, rest: afterSize } = stripLeadingSize(rest);
  rest = afterSize.trim();

  const { unit, rest: afterUnit } = stripLeadingUnit(rest);
  rest = afterUnit.trim();

  // "1 can of tomatoes" → after the unit, drop the connective "of".
  rest = rest.replace(/^of\s+/i, '');

  let name = rest.replace(/\s+/g, ' ').trim();

  // Conservative fallback: never return an empty name.
  if (name.length === 0) {
    return { name: sentenceCase(raw.trim()), raw };
  }

  // Sentence-case the noun, then append the (already lower-cased) descriptor so
  // it stays lower-cased: "Tomatoes (medium)".
  name = sentenceCase(name);
  if (descriptor) name = `${name} (${descriptor})`;

  return {
    name,
    ...(quantity !== undefined ? { quantity } : {}),
    ...(unit !== undefined ? { unit } : {}),
    raw,
  };
}
