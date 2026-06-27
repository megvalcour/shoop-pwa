import { describe, it, expect } from 'vitest';
import { normalizeIngredient } from '@/utils/normalizeIngredient';

describe('normalizeIngredient', () => {
  it('strips a leading integer quantity and unit', () => {
    const result = normalizeIngredient('2 cups all-purpose flour');
    expect(result.name).toBe('all-purpose flour');
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe('cups');
    expect(result.raw).toBe('2 cups all-purpose flour');
  });

  it('strips a trailing prep clause after a comma', () => {
    const result = normalizeIngredient('2 cups all-purpose flour, sifted');
    expect(result.name).toBe('all-purpose flour');
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe('cups');
  });

  it('parses a unicode vulgar fraction', () => {
    const result = normalizeIngredient('½ teaspoon salt');
    expect(result.name).toBe('salt');
    expect(result.quantity).toBe(0.5);
    expect(result.unit).toBe('teaspoon');
  });

  it('parses an integer followed by a vulgar fraction', () => {
    const result = normalizeIngredient('2½ cups milk');
    expect(result.name).toBe('milk');
    expect(result.quantity).toBe(2.5);
    expect(result.unit).toBe('cups');
  });

  it('parses a mixed ascii number', () => {
    const result = normalizeIngredient('1 1/2 cups whole milk');
    expect(result.name).toBe('whole milk');
    expect(result.quantity).toBe(1.5);
    expect(result.unit).toBe('cups');
  });

  it('parses a simple ascii fraction and rounds repeating decimals', () => {
    const result = normalizeIngredient('1/3 cup sugar');
    expect(result.name).toBe('sugar');
    expect(result.quantity).toBe(0.333);
    expect(result.unit).toBe('cup');
  });

  it('takes the lower bound of a numeric range', () => {
    const result = normalizeIngredient('1-2 cloves garlic, minced');
    expect(result.name).toBe('garlic');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('cloves');
  });

  it('handles a written "to" range', () => {
    const result = normalizeIngredient('1 to 2 cups broth');
    expect(result.name).toBe('broth');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('cups');
  });

  it('strips an abbreviated unit with a trailing period', () => {
    const result = normalizeIngredient('1 lb. ground beef');
    expect(result.name).toBe('ground beef');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('lb');
  });

  it('removes a parenthetical size note', () => {
    const result = normalizeIngredient('1 (14.5 oz) can diced tomatoes');
    expect(result.name).toBe('diced tomatoes');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('can');
  });

  it('drops the connective "of" after a container unit', () => {
    const result = normalizeIngredient('1 can of black beans');
    expect(result.name).toBe('black beans');
    expect(result.quantity).toBe(1);
    expect(result.unit).toBe('can');
  });

  it('handles a leading article before a unit', () => {
    const result = normalizeIngredient('a pinch of salt');
    expect(result.name).toBe('salt');
    expect(result.quantity).toBeUndefined();
    expect(result.unit).toBe('pinch');
  });

  it('recognises the two-word "fl oz" unit', () => {
    const result = normalizeIngredient('8 fl oz heavy cream');
    expect(result.name).toBe('heavy cream');
    expect(result.quantity).toBe(8);
    expect(result.unit).toBe('fl oz');
  });

  it('keeps size descriptors that are not units', () => {
    const result = normalizeIngredient('3 large eggs, beaten');
    expect(result.name).toBe('large eggs');
    expect(result.quantity).toBe(3);
    expect(result.unit).toBeUndefined();
  });

  it('leaves a plain ingredient untouched when nothing parses', () => {
    const result = normalizeIngredient('Salt and pepper to taste');
    expect(result.name).toBe('Salt and pepper to taste');
    expect(result.quantity).toBeUndefined();
    expect(result.unit).toBeUndefined();
  });

  it('does not treat a leading food word as a unit', () => {
    const result = normalizeIngredient('Juice of 1 lemon');
    expect(result.name).toBe('Juice of 1 lemon');
    expect(result.quantity).toBeUndefined();
    expect(result.unit).toBeUndefined();
  });

  it('strips a leading list-marker glyph', () => {
    const result = normalizeIngredient('▢ 2 tablespoons olive oil');
    expect(result.name).toBe('olive oil');
    expect(result.quantity).toBe(2);
    expect(result.unit).toBe('tablespoons');
  });

  it('never strips a unit down to an empty name', () => {
    const result = normalizeIngredient('2 cups');
    expect(result.name).toBe('cups');
    expect(result.quantity).toBe(2);
    expect(result.unit).toBeUndefined();
  });

  it('falls back to the raw string when the line is only a prep clause', () => {
    const result = normalizeIngredient(', to taste');
    expect(result.name).toBe(', to taste');
    expect(result.raw).toBe(', to taste');
  });

  it('preserves the original raw string regardless of transformation', () => {
    const raw = '  ¾ cup grated Parmesan cheese, divided  ';
    const result = normalizeIngredient(raw);
    expect(result.raw).toBe(raw);
    expect(result.name).toBe('grated Parmesan cheese');
    expect(result.quantity).toBe(0.75);
    expect(result.unit).toBe('cup');
  });
});
