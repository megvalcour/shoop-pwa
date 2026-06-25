import { describe, it, expect } from 'vitest';
import { formatQuantity } from '@/lib/formatQuantity';

describe('formatQuantity', () => {
  it('renders "N unit" when a unit is present', () => {
    expect(formatQuantity(2, 'lbs')).toBe('2 lbs');
  });

  it('trims surrounding whitespace from the unit', () => {
    expect(formatQuantity(3, '  cans  ')).toBe('3 cans');
  });

  it('falls back to "×N" when no unit is given', () => {
    expect(formatQuantity(2)).toBe('×2');
  });

  it('falls back to "×N" when the unit is empty or whitespace-only', () => {
    expect(formatQuantity(5, '')).toBe('×5');
    expect(formatQuantity(5, '   ')).toBe('×5');
  });
});
