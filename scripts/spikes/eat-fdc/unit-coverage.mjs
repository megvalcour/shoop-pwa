// Spike 2 (Eat Phase 0): quantity -> grams feasibility.
//
// Pure / offline. Reads the *real* UNITS vocabulary out of
// src/utils/normalizeIngredient.ts (the surface the eventual extraction parses)
// and buckets each unit by how it converts to grams:
//   - mass:      direct static factor -> grams
//   - volume:    needs an ingredient DENSITY (g/ml) to reach grams
//   - count:     needs a per-piece gram weight (FDC foodPortions or manual table)
//
// Output: a coverage map written to stdout + unit-coverage.json. Run:
//   node scripts/spikes/eat-fdc/unit-coverage.mjs
//
// Throwaway spike code — NOT imported by src/. See README.md.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcPath = resolve(here, '../../../src/utils/normalizeIngredient.ts');

// Extract the literal UNITS set from source so this spike tracks the real vocab.
const src = readFileSync(srcPath, 'utf8');
const block = src.match(/const UNITS = new Set\(\[([\s\S]*?)\]\)/);
if (!block) {
  console.error('Could not locate UNITS set in normalizeIngredient.ts');
  process.exit(1);
}
const units = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

// Classification of each canonical unit family. Abbreviations/plurals in UNITS
// collapse onto these families.
const MASS = new Set(['cup-NO']); // placeholder, mass matched below by membership
const massUnits = new Set([
  'ounce', 'ounces', 'oz', 'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g', 'kilogram', 'kilograms', 'kg',
]);
const volumeUnits = new Set([
  'cup', 'cups', 'c',
  'tablespoon', 'tablespoons', 'tbsp', 'tbsps', 'tbs', 'tbl',
  'teaspoon', 'teaspoons', 'tsp', 'tsps',
  'milliliter', 'milliliters', 'millilitre', 'millilitres', 'ml',
  'liter', 'liters', 'litre', 'litres', 'l',
  'quart', 'quarts', 'qt', 'pint', 'pints', 'pt', 'gallon', 'gallons', 'gal',
  'pinch', 'pinches', 'dash', 'dashes',
]);
// Everything else is count / container: needs a per-piece gram weight.
function bucket(u) {
  if (massUnits.has(u)) return 'mass';
  if (volumeUnits.has(u)) return 'volume';
  return 'count';
}

const buckets = { mass: [], volume: [], count: [] };
for (const u of units) buckets[bucket(u)].push(u);

// Static mass-to-grams factors (the directly-convertible set).
const MASS_FACTORS_G = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };

const coverage = {
  totalUnitTokens: units.length,
  mass: {
    convertible: 'auto (static factor)',
    factorsGrams: MASS_FACTORS_G,
    tokens: buckets.mass,
  },
  volume: {
    convertible: 'needs ingredient density (g/ml); base ml factors static',
    baseMlFactors: {
      ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588,
      pt: 473.176, qt: 946.353, gal: 3785.41,
      // pinch/dash are imprecise; treat as ~0.36 ml / ~0.62 ml or fall back to manual.
      pinch: 0.36, dash: 0.62,
    },
    tokens: buckets.volume,
  },
  count: {
    convertible: 'needs per-piece grams: FDC foodPortions first, manual table fallback',
    tokens: buckets.count,
  },
};

writeFileSync(resolve(here, 'unit-coverage.json'), JSON.stringify(coverage, null, 2));

const pct = (n) => `${Math.round((n / units.length) * 100)}%`;
console.log('Spike 2 — quantity -> grams unit coverage');
console.log('─'.repeat(60));
console.log(`Total unit tokens in UNITS set: ${units.length}\n`);
console.log(`MASS   (auto, static factor)        ${buckets.mass.length} tokens  ${pct(buckets.mass.length)}`);
console.log(`  ${buckets.mass.join(', ')}\n`);
console.log(`VOLUME (needs ingredient density)   ${buckets.volume.length} tokens  ${pct(buckets.volume.length)}`);
console.log(`  ${buckets.volume.join(', ')}\n`);
console.log(`COUNT  (needs per-piece grams)      ${buckets.count.length} tokens  ${pct(buckets.count.length)}`);
console.log(`  ${buckets.count.join(', ')}\n`);
console.log('Wrote unit-coverage.json');
