import { describe, it, expect } from 'vitest';
import { parseStoreImport, slugify } from '@/utils/parseStoreImport';

const VALID = JSON.stringify({
  name: "Trader Joe's — Cambridge",
  address: '748 Memorial Dr, Cambridge MA',
  aisles: [
    { number: '1', label: 'Produce', items: ['Banana', 'Spinach', 'banana'] },
    { label: 'Bakery', items: ['Bread'] },
  ],
});

describe('parseStoreImport', () => {
  it('parses a valid store, defaulting the aisle number from index and deduping items', () => {
    const result = parseStoreImport(VALID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.store.name).toBe("Trader Joe's — Cambridge");
    expect(result.store.address).toBe('748 Memorial Dr, Cambridge MA');
    expect(result.store.aisles).toEqual([
      { number: '1', label: 'Produce', sortOrder: 0, items: ['banana', 'spinach'] },
      { number: '2', label: 'Bakery', sortOrder: 1, items: ['bread'] },
    ]);
  });

  it('rejects malformed JSON with a friendly message', () => {
    const result = parseStoreImport('{ not json ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatch(/valid json/i);
  });

  it('rejects empty input', () => {
    const result = parseStoreImport('   ');
    expect(result.ok).toBe(false);
  });

  it('rejects a missing or empty name', () => {
    const result = parseStoreImport(JSON.stringify({ name: '  ', aisles: [{ label: 'A' }] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => /name/i.test(e))).toBe(true);
  });

  it('rejects an empty aisles array', () => {
    const result = parseStoreImport(JSON.stringify({ name: 'X', aisles: [] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => /aisles/i.test(e))).toBe(true);
  });

  it('rejects an aisle missing a label', () => {
    const result = parseStoreImport(JSON.stringify({ name: 'X', aisles: [{ items: ['a'] }] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => /label/i.test(e))).toBe(true);
  });

  it('treats a numeric "number" and missing items as valid', () => {
    const result = parseStoreImport(JSON.stringify({ name: 'X', aisles: [{ number: 3, label: 'A' }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.store.aisles[0]).toEqual({ number: '3', label: 'A', sortOrder: 0, items: [] });
  });
});

describe('slugify', () => {
  it('lowercases, strips punctuation, and collapses separators', () => {
    expect(slugify("Trader Joe's — Cambridge")).toBe('trader-joe-s-cambridge');
  });

  it('trims leading/trailing separators', () => {
    expect(slugify('  Big Y!  ')).toBe('big-y');
  });
});
