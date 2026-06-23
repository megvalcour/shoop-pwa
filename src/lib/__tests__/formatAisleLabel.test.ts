import { describe, it, expect } from 'vitest';
import { formatAisleLabel } from '@/lib/formatAisleLabel';

describe('formatAisleLabel', () => {
  it('formats a numeric aisle as "Aisle N — Label"', () => {
    expect(formatAisleLabel({ number: '1', label: 'Dairy & Eggs' })).toBe(
      'Aisle 1 — Dairy & Eggs',
    );
  });

  it('returns the label only for a non-numeric number (named section)', () => {
    expect(formatAisleLabel({ number: 'Produce', label: 'Produce' })).toBe('Produce');
  });

  it('returns the label only when number is empty', () => {
    expect(formatAisleLabel({ number: '', label: 'Bakery' })).toBe('Bakery');
  });
});
