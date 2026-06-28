/**
 * Pure, network-free normalization of a raw recipe ingredient string into an
 * addable grocery item *name*. Raw `recipeIngredient` strings look like
 * `"2 cups all-purpose flour, sifted"`; added verbatim they classify poorly in
 * the aisle matcher and read badly on a list. This greedily discards the entire
 * leading measure run (quantity + unit, including dual US/metric measures),
 * drops parentheticals and trailing prep clauses, and keeps the cleaned noun
 * phrase as `name`.
 *
 * Per ADR-0021 it does **not** extract a quantity or unit: the leading measure
 * run is noise to discard, not data to capture. Imported items land at the
 * default quantity ×1 like any manual add, and the import preview lets the user
 * set a unit. Removing the "keep one measure, drop the rest" decision deletes the
 * dual-measure mis-parse class structurally.
 *
 * It is deliberately **conservative**: when it can't confidently isolate a noun
 * phrase it falls back to the raw string. A slightly-wordy item ("Salt and
 * pepper to taste") beats a wrong one ("pepper to taste"). The original `raw`
 * is always preserved for display/tooltip.
 */

export interface NormalizedIngredient {
  /** Cleaned noun phrase suitable for `items.name`. */
  name: string;
  /** The original, untouched ingredient string. */
  raw: string;
}

/** Vulgar-fraction code points, kept as a character class for matching only. */
const FRAC = `[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]`;

/**
 * A single numeric value, most-specific alternative first: mixed number
 * (`2 1/2`), ascii fraction (`1/2`), integer/decimal with a vulgar fraction
 * suffix (`2½`), a bare vulgar fraction (`½`), or a plain integer/decimal.
 * Used to *recognise and consume* a leading number — its value is never read.
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
const LEADING_QUANTITY = new RegExp(`^(?:${NUMBER_SRC})(?:${RANGE_SEP}(?:${NUMBER_SRC}))?`);

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

/**
 * Short, human-friendly unit suggestions for the import preview's optional unit
 * control (a free-text `Input` backed by a `<datalist>`, matching the manual-add
 * UX). Curated singular forms — not the full `UNITS` match set, which carries
 * abbreviations and plurals that read poorly as suggestions.
 */
export const UNIT_SUGGESTIONS = [
  'cup',
  'tablespoon',
  'teaspoon',
  'ounce',
  'pound',
  'gram',
  'kilogram',
  'milliliter',
  'liter',
  'can',
  'package',
  'jar',
  'bottle',
  'bunch',
  'clove',
  'stick',
  'pinch',
] as const;

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

/** Lower-case a unit token and drop a trailing period (`Tbsp.` → `tbsp`). */
function cleanToken(token: string): string {
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
function normalizeMeasureRegion(s: string): string {
  let out = s.replace(/\s*\/\s*/g, ' / ');
  out = out.replace(/(\d+(?:\.\d+)?)([a-zA-Z]+)/g, (match, num: string, unit: string) =>
    UNITS.has(unit.toLowerCase()) ? `${num} ${unit}` : match,
  );
  return out.replace(/\s+/g, ' ').trim();
}

/** Strip a leading quantity (or range) if present; returns the remainder. */
function stripLeadingQuantity(s: string): string {
  const match = s.match(LEADING_QUANTITY);
  if (!match) return s;
  return s.slice(match[0].length);
}

/**
 * Consume a leading known unit token, returning the remainder. Recognises the
 * two-word "fl oz". Only strips when a noun phrase would remain, so a bare unit
 * ("cups", "fl oz") never empties the name.
 */
function stripLeadingUnit(s: string): string {
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return s;

  const first = cleanToken(tokens[0]);

  // Two-word "fl oz" / "fluid ounce".
  if (first === 'fl' && tokens[1] && OUNCE_TOKENS.has(cleanToken(tokens[1]))) {
    if (tokens.length > 2) return tokens.slice(2).join(' ');
    return s; // would empty the name — leave it intact
  }

  if (UNITS.has(first) && tokens.length > 1) {
    return tokens.slice(1).join(' ');
  }

  return s;
}

/**
 * Greedily discard the leading measure run, returning only the noun phrase.
 * Consumes an optional leading unit, then any number of
 * `<separator> <quantity> [unit]` groups across `/` or `or` boundaries — this is
 * where dual US/metric measures ("1 cup / 180 grams", "100 g / 3.5 oz",
 * "1 cup or 240 ml") get discarded wholesale. Bails before any step that would
 * empty the name, leaving the remainder for the raw-string fallback. The first
 * quantity is consumed by `stripLeadingQuantity` upstream; this picks up at the
 * unit that follows it.
 */
function stripLeadingMeasures(s: string): string {
  let rest = stripLeadingUnit(s);

  for (;;) {
    const sep = rest.match(/^(?:\/|or)\s+/i);
    if (!sep) break;

    const candidate = rest.slice(sep[0].length);
    const afterQty = stripLeadingQuantity(candidate);
    if (afterQty === candidate) break; // separator not followed by a number — leave it

    const next = stripLeadingUnit(afterQty.trim()).trim();
    if (next.length === 0) break; // would empty the name — leave the clause for the fallback

    rest = next;
  }

  return rest;
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

  // Collapse the spaced/unspaced/glued measure variants into one shape so the
  // greedy measure strip below sees a single code path.
  work = normalizeMeasureRegion(work);

  let rest = stripLeadingQuantity(work).trim();

  // A leading article often precedes a unit ("a pinch of salt").
  rest = rest.replace(/^(?:an?)\s+/i, '');

  // Lift a leading size descriptor into a trailing parenthetical. This runs
  // *before* the measure strip so a descriptor that precedes a container unit
  // ("large can of tomatoes") still resolves to the bare noun ("tomatoes
  // (large)") rather than stranding "can of …" in the name.
  const { descriptor, rest: afterSize } = stripLeadingSize(rest);
  rest = afterSize.trim();

  // Greedily discard the unit + any slash/"or"-delimited alternate measures.
  rest = stripLeadingMeasures(rest);

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

  return { name, raw };
}
