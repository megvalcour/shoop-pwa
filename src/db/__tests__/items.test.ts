import { describe, expect, it } from 'vitest';
import { resolveItem } from '@/db/items';
import type { Item } from '@/db/schema';

describe('resolveItem', () => {
  const catalog: Item[] = [{ id: 'i1', name: 'Milk', canonical_name: 'milk' }];

  it('reuses an existing item when the canonical name matches (case-insensitive)', () => {
    const resolved = resolveItem(catalog, 'MILK');
    expect(resolved.itemId).toBe('i1');
    expect(resolved.itemCreated).toBe(false);
    expect(resolved.newItem).toBeUndefined();
  });

  it('mints a new item with a UUID and canonical name when novel', () => {
    const resolved = resolveItem(catalog, '  Eggs  '.trim());
    expect(resolved.itemCreated).toBe(true);
    expect(resolved.itemId).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolved.newItem).toEqual({
      id: resolved.itemId,
      name: 'Eggs',
      canonical_name: 'eggs',
    });
  });
});
