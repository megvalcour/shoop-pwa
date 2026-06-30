import { describe, it, expect } from 'vitest';
import { parseIngredientMeasure } from '@/utils/parseIngredientMeasure';
import { normalizeIngredient } from '@/utils/normalizeIngredient';

/**
 * `parseIngredientMeasure` recovers the quantity + unit that `normalizeIngredient`
 * deliberately discards (ADR-0021). Every fixture below asserts BOTH: the recovered
 * measure AND the unchanged normalized name on the SAME input — proving the two
 * stay consistent (the parser reads exactly what the normalizer throws away).
 */

describe('parseIngredientMeasure', () => {
  it('reads an integer quantity and a known unit', () => {
    expect(parseIngredientMeasure('2 cups all-purpose flour')).toEqual({
      quantity: 2,
      unit: 'cups',
    });
    expect(normalizeIngredient('2 cups all-purpose flour').name).toBe('All-purpose flour');
  });

  it('reads a decimal quantity', () => {
    expect(parseIngredientMeasure('3.5 oz dark chocolate')).toEqual({ quantity: 3.5, unit: 'oz' });
    expect(normalizeIngredient('3.5 oz dark chocolate').name).toBe('Dark chocolate');
  });

  it('reads an ascii fraction as a decimal', () => {
    expect(parseIngredientMeasure('1/2 cup sugar')).toEqual({ quantity: 0.5, unit: 'cup' });
    expect(normalizeIngredient('1/2 cup sugar').name).toBe('Sugar');
  });

  it('reads a mixed number as a decimal', () => {
    expect(parseIngredientMeasure('1 1/2 cups milk')).toEqual({ quantity: 1.5, unit: 'cups' });
    expect(normalizeIngredient('1 1/2 cups milk').name).toBe('Milk');
  });

  it('reads a bare vulgar fraction', () => {
    expect(parseIngredientMeasure('½ cup butter')).toEqual({ quantity: 0.5, unit: 'cup' });
    expect(normalizeIngredient('½ cup butter').name).toBe('Butter');
  });

  it('reads an integer with a trailing vulgar fraction', () => {
    expect(parseIngredientMeasure('2½ cups water')).toEqual({ quantity: 2.5, unit: 'cups' });
    expect(normalizeIngredient('2½ cups water').name).toBe('Water');
  });

  it('takes the LOW/first value of a range (with "to")', () => {
    expect(parseIngredientMeasure('1 to 2 cups broth')).toEqual({ quantity: 1, unit: 'cups' });
    expect(normalizeIngredient('1 to 2 cups broth').name).toBe('Broth');
  });

  it('takes the LOW/first value of a hyphenated range', () => {
    expect(parseIngredientMeasure('1-2 tablespoons olive oil')).toEqual({
      quantity: 1,
      unit: 'tablespoons',
    });
    expect(normalizeIngredient('1-2 tablespoons olive oil').name).toBe('Olive oil');
  });

  it('reads a container unit', () => {
    expect(parseIngredientMeasure('1 can black beans')).toEqual({ quantity: 1, unit: 'can' });
    expect(normalizeIngredient('1 can black beans').name).toBe('Black beans');
  });

  it('strips a trailing period from a unit abbreviation', () => {
    expect(parseIngredientMeasure('2 tbsp. butter')).toEqual({ quantity: 2, unit: 'tbsp' });
    expect(normalizeIngredient('2 tbsp. butter').name).toBe('Butter');
  });

  it('recognises the two-word "fl oz" unit', () => {
    expect(parseIngredientMeasure('1 fl oz vanilla')).toEqual({ quantity: 1, unit: 'fl oz' });
    expect(normalizeIngredient('1 fl oz vanilla').name).toBe('Vanilla');
  });

  it('takes the FIRST measure of a dual US/metric line', () => {
    expect(parseIngredientMeasure('100 g / 3.5 oz chocolate')).toEqual({
      quantity: 100,
      unit: 'g',
    });
    expect(normalizeIngredient('100 g / 3.5 oz chocolate').name).toBe('Chocolate');
  });

  it('returns no unit when the token after the quantity is not a unit', () => {
    expect(parseIngredientMeasure('3 large eggs')).toEqual({ quantity: 3, unit: undefined });
    expect(normalizeIngredient('3 large eggs').name).toBe('Eggs (large)');
  });

  it('returns no unit for an unknown unit token', () => {
    expect(parseIngredientMeasure('2 medium onions')).toEqual({ quantity: 2, unit: undefined });
    expect(normalizeIngredient('2 medium onions').name).toBe('Onions (medium)');
  });

  it('returns undefined quantity when there is no leading number', () => {
    expect(parseIngredientMeasure('Salt and pepper to taste')).toEqual({
      quantity: undefined,
      unit: undefined,
    });
    expect(normalizeIngredient('Salt and pepper to taste').name).toBe('Salt and pepper to taste');
  });

  it('reads a unit after an article when there is no number ("a pinch of salt")', () => {
    expect(parseIngredientMeasure('a pinch of salt')).toEqual({
      quantity: undefined,
      unit: 'pinch',
    });
    expect(normalizeIngredient('a pinch of salt').name).toBe('Salt');
  });

  it('returns nothing for a bare noun', () => {
    expect(parseIngredientMeasure('Eggs')).toEqual({ quantity: undefined, unit: undefined });
    expect(normalizeIngredient('Eggs').name).toBe('Eggs');
  });

  it('ignores a parenthetical conversion when reading the leading measure', () => {
    expect(parseIngredientMeasure('1 cup (240 ml) milk')).toEqual({ quantity: 1, unit: 'cup' });
    expect(normalizeIngredient('1 cup (240 ml) milk').name).toBe('Milk');
  });

  it('reads a number glued to a unit (100g)', () => {
    expect(parseIngredientMeasure('100g flour')).toEqual({ quantity: 100, unit: 'g' });
    expect(normalizeIngredient('100g flour').name).toBe('Flour');
  });
});
