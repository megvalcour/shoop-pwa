import { describe, it, expect } from 'vitest';
import { normalizeIngredient } from '@/utils/normalizeIngredient';

describe('normalizeIngredient', () => {
  it('strips a leading integer quantity and unit', () => {
    const result = normalizeIngredient('2 cups all-purpose flour');
    expect(result.name).toBe('All-purpose flour');
    expect(result.raw).toBe('2 cups all-purpose flour');
  });

  it('strips a trailing prep clause after a comma', () => {
    const result = normalizeIngredient('2 cups all-purpose flour, sifted');
    expect(result.name).toBe('All-purpose flour');
  });

  it('discards a unicode vulgar fraction quantity', () => {
    const result = normalizeIngredient('½ teaspoon salt');
    expect(result.name).toBe('Salt');
  });

  it('discards an integer followed by a vulgar fraction', () => {
    const result = normalizeIngredient('2½ cups milk');
    expect(result.name).toBe('Milk');
  });

  it('discards a mixed ascii number', () => {
    const result = normalizeIngredient('1 1/2 cups whole milk');
    expect(result.name).toBe('Whole milk');
  });

  it('discards a simple ascii fraction', () => {
    const result = normalizeIngredient('1/3 cup sugar');
    expect(result.name).toBe('Sugar');
  });

  it('discards a numeric range', () => {
    const result = normalizeIngredient('1-2 cloves garlic, minced');
    expect(result.name).toBe('Garlic');
  });

  it('handles a written "to" range', () => {
    const result = normalizeIngredient('1 to 2 cups broth');
    expect(result.name).toBe('Broth');
  });

  it('strips an abbreviated unit with a trailing period', () => {
    const result = normalizeIngredient('1 lb. ground beef');
    expect(result.name).toBe('Ground beef');
  });

  it('removes a parenthetical size note', () => {
    const result = normalizeIngredient('1 (14.5 oz) can diced tomatoes');
    expect(result.name).toBe('Diced tomatoes');
  });

  it('drops the connective "of" after a container unit', () => {
    const result = normalizeIngredient('1 can of black beans');
    expect(result.name).toBe('Black beans');
  });

  it('handles a leading article before a unit', () => {
    const result = normalizeIngredient('a pinch of salt');
    expect(result.name).toBe('Salt');
  });

  it('recognises the two-word "fl oz" unit', () => {
    const result = normalizeIngredient('8 fl oz heavy cream');
    expect(result.name).toBe('Heavy cream');
  });

  it('lifts a leading size descriptor into a parenthetical', () => {
    const result = normalizeIngredient('3 medium tomatoes');
    expect(result.name).toBe('Tomatoes (medium)');
  });

  it('moves a size descriptor out of the noun phrase', () => {
    const result = normalizeIngredient('2 large eggs, beaten');
    expect(result.name).toBe('Eggs (large)');
  });

  it('normalises the hyphenated "extra-large" descriptor', () => {
    const result = normalizeIngredient('extra-large eggs');
    expect(result.name).toBe('Eggs (extra-large)');
  });

  it('normalises the two-token "extra large" descriptor', () => {
    const result = normalizeIngredient('extra large eggs');
    expect(result.name).toBe('Eggs (extra-large)');
  });

  it('lifts a descriptor that precedes a container unit', () => {
    // The size strip runs before the measure strip, so "large" lifts out and the
    // unit ("can") + connective ("of") still resolve to the bare noun.
    const result = normalizeIngredient('1 large can of tomatoes');
    expect(result.name).toBe('Tomatoes (large)');
  });

  it('does not reduce a bare size descriptor to an empty name', () => {
    const result = normalizeIngredient('large');
    expect(result.name).toBe('Large');
  });

  it('leaves a plain ingredient untouched when nothing parses', () => {
    const result = normalizeIngredient('Salt and pepper to taste');
    expect(result.name).toBe('Salt and pepper to taste');
  });

  it('does not treat a leading food word as a unit', () => {
    const result = normalizeIngredient('Juice of 1 lemon');
    expect(result.name).toBe('Juice of 1 lemon');
  });

  it('strips a leading list-marker glyph', () => {
    const result = normalizeIngredient('▢ 2 tablespoons olive oil');
    expect(result.name).toBe('Olive oil');
  });

  it('never strips a unit down to an empty name', () => {
    const result = normalizeIngredient('2 cups');
    expect(result.name).toBe('Cups');
  });

  it('sentence-cases the raw-string fallback and never crashes', () => {
    const result = normalizeIngredient(', to taste');
    expect(result.name).toBe(', To taste');
    expect(result.raw).toBe(', to taste');
  });

  it('does not mistake an ascii fraction for a dual measure', () => {
    const result = normalizeIngredient('1/2 cup sugar');
    expect(result.name).toBe('Sugar');
  });

  it('leaves a name containing no measure untouched', () => {
    const result = normalizeIngredient('2 cups whole milk');
    expect(result.name).toBe('Whole milk');
  });

  it('preserves proper nouns when sentence-casing the name', () => {
    const raw = '  ¾ cup grated Parmesan cheese, divided  ';
    const result = normalizeIngredient(raw);
    expect(result.raw).toBe(raw);
    expect(result.name).toBe('Grated Parmesan cheese');
  });

  // Dual-measure regression fixtures (ADR-0021): the leading measure run is
  // discarded wholesale regardless of slash spacing, glue, or ordering, so none
  // of these strand an alternate measure in the name.
  it('discards a no-space slash dual measure', () => {
    const result = normalizeIngredient('2 cups/70 grams chocolate chips');
    expect(result.name).toBe('Chocolate chips');
  });

  it('discards a glued metric/imperial dual measure', () => {
    const result = normalizeIngredient('100g/3.5oz dark chocolate');
    expect(result.name).toBe('Dark chocolate');
  });

  it('discards a spaced slash dual measure', () => {
    const result = normalizeIngredient('1 cup / 180 grams flour');
    expect(result.name).toBe('Flour');
  });

  it('discards a metric-leading slash dual measure', () => {
    const result = normalizeIngredient('180 grams / 1 cup flour');
    expect(result.name).toBe('Flour');
  });

  it('discards a container-unit slash dual measure', () => {
    const result = normalizeIngredient('1 stick / 113 g butter');
    expect(result.name).toBe('Butter');
  });

  it('discards an "or"-delimited dual measure', () => {
    const result = normalizeIngredient('1 cup or 240 ml milk');
    expect(result.name).toBe('Milk');
  });

  it('keeps an alphanumeric token that is not a measure', () => {
    // The digit↔unit glue split only fires when the trailing letters are a known
    // unit, so a brand-style name like "7Up" is not shattered into "7 Up".
    const result = normalizeIngredient('1 bottle 7Up');
    expect(result.name).toBe('7Up');
  });
});
