/**
 * Recipe-scoped recovery of an ingredient line's quantity + unit — the value
 * `normalizeIngredient` deliberately DISCARDS (ADR-0021). This is a SEPARATE pure
 * util so that ADR-0021's noun-phrase behaviour is untouched: `normalizeIngredient`
 * keeps throwing the leading measure run away, while this reads it. Used only on
 * the "Save as recipe" path (Eat tab, Phase 3) to pre-fill the import preview's
 * per-row quantity/unit; the shopping-list / default-list paths still default to
 * ×1 exactly as before.
 *
 * Pure and network-free: no React, no `db/`. Shares the measure vocabulary with
 * `normalizeIngredient` via `measureTokens.ts`, so the two never disagree on what
 * a number or a unit is.
 *
 * Conversion of quantity+unit → grams is explicitly Phase 4 (the enrichment
 * pipeline, using FDC portion data + a density table). This util only captures the
 * raw quantity value and the unit token.
 */

import {
  FRAC,
  LEADING_NUMBER,
  LEADING_QUANTITY,
  OUNCE_TOKENS,
  UNITS,
  cleanToken,
  normalizeMeasureRegion,
} from '@/utils/measureTokens';

export interface IngredientMeasure {
  /** Recovered quantity; undefined when the line has no leading number. */
  quantity?: number;
  /** Recovered unit token (lower-cased); undefined when none is recognized. */
  unit?: string;
}

/** Map each vulgar-fraction glyph to its decimal value. */
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

const FRAC_RE = new RegExp(FRAC);

/**
 * Parse one recognized numeric token (as matched by `NUMBER_SRC`) into a decimal:
 * mixed number (`1 1/2` → 1.5), ascii fraction (`1/2` → 0.5), value + vulgar
 * suffix (`2½` → 2.5), bare vulgar (`½` → 0.5), or plain integer/decimal. Returns
 * undefined only for genuinely unparseable input (defensive — the regex upstream
 * should guarantee a value).
 */
function parseNumberToken(token: string): number | undefined {
  const t = token.trim();

  // Mixed number: "1 1/2" → 1 + 1/2. Only an integer whole part, then a fraction.
  const mixed = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const denom = Number(mixed[3]);
    return denom === 0 ? Number(mixed[1]) : Number(mixed[1]) + Number(mixed[2]) / denom;
  }

  // Ascii fraction: "1/2".
  const fraction = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const denom = Number(fraction[2]);
    return denom === 0 ? undefined : Number(fraction[1]) / denom;
  }

  // Integer/decimal with a trailing vulgar fraction: "2½".
  const withVulgar = t.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*(${FRAC})$`));
  if (withVulgar) {
    return Number(withVulgar[1]) + (VULGAR_FRACTIONS[withVulgar[2]] ?? 0);
  }

  // Bare vulgar fraction: "½".
  if (FRAC_RE.test(t) && t.length === 1) {
    return VULGAR_FRACTIONS[t];
  }

  // Plain integer or decimal.
  const plain = Number(t);
  return Number.isNaN(plain) ? undefined : plain;
}

/**
 * Read the leading unit token from the measure remainder (the text after the
 * quantity has been consumed). Mirrors `normalizeIngredient`'s `stripLeadingUnit`
 * matching rules — recognises the two-word "fl oz", only treats a token as a unit
 * when a noun phrase still follows — so the two stay consistent on the same input.
 * Returns the cleaned unit token, or undefined.
 */
function readLeadingUnit(remainder: string): string | undefined {
  const tokens = remainder.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return undefined;

  const first = cleanToken(tokens[0]);

  // Two-word "fl oz" / "fluid ounce" — only when a noun phrase remains after it.
  if (first === 'fl' && tokens[1] && OUNCE_TOKENS.has(cleanToken(tokens[1]))) {
    return tokens.length > 2 ? 'fl oz' : undefined;
  }

  if (UNITS.has(first) && tokens.length > 1) {
    return first;
  }

  return undefined;
}

/**
 * Recover `{ quantity?, unit? }` from a raw recipe ingredient line. Runs the same
 * leading preprocessing as `normalizeIngredient` (list-marker strip, parenthetical
 * drop, trailing-clause cut, measure-region normalization) so the two see the same
 * measure region, then READS the leading quantity and unit rather than discarding
 * them.
 *
 * A leading numeric value is parsed to a decimal; a range ("1 to 2 cups") takes the
 * LOW / first value. No leading number → `quantity` undefined (the caller defaults
 * to 1). A leading token not in the unit set → `unit` undefined.
 */
export function parseIngredientMeasure(raw: string): IngredientMeasure {
  let work = raw.trim();

  // Mirror normalizeIngredient's preprocessing so both read the same region.
  work = work.replace(/^[\s\-•*▢▪◦·–—]+/, '');
  work = work.replace(/\([^)]*\)/g, ' ');
  const clauseStart = work.search(/[,;]/);
  if (clauseStart >= 0) work = work.slice(0, clauseStart);
  work = normalizeMeasureRegion(work);

  // Quantity: parse the FIRST number of the (optionally ranged) leading quantity,
  // then consume the WHOLE leading-quantity expression (incl. any range tail) so
  // the unit read starts cleanly past it.
  let quantity: number | undefined;
  const numberMatch = work.match(LEADING_NUMBER);
  if (numberMatch) {
    quantity = parseNumberToken(numberMatch[0]);
  }
  const quantityMatch = work.match(LEADING_QUANTITY);
  let remainder = quantityMatch ? work.slice(quantityMatch[0].length) : work;

  // A leading article often precedes a unit ("a pinch of salt").
  remainder = remainder.replace(/^(?:an?)\s+/i, '').trim();

  const unit = readLeadingUnit(remainder);

  return { quantity, unit };
}
