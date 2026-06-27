import { describe, it, expect } from 'vitest';
import { buildAisleCandidates } from '@/utils/buildAisleCandidates';
import type { Aisle, Item, ItemLocation } from '@/db/schema';

function item(id: string, canonical_name: string): Item {
  return { id, name: canonical_name, canonical_name };
}

function aisle(id: string, number: string): Aisle {
  return { id, store_id: 'store-1', number, label: number, sort_order: 0 };
}

function location(item_id: string, aisle_id: string): ItemLocation {
  return { id: `loc-${item_id}`, item_id, store_id: 'store-1', aisle_id };
}

describe('buildAisleCandidates', () => {
  it('joins located items to their aisle number for the matcher', () => {
    const candidates = buildAisleCandidates(
      [item('i-bread', 'bread'), item('i-milk', 'milk')],
      [aisle('a-21', '21'), aisle('a-1', '1')],
      [location('i-bread', 'a-21'), location('i-milk', 'a-1')],
      undefined,
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phrase: 'bread', aisleNumber: '21' }),
        expect.objectContaining({ phrase: 'milk', aisleNumber: '1' }),
      ]),
    );
  });

  it('drops a location whose item is missing from the catalog', () => {
    const candidates = buildAisleCandidates(
      [item('i-bread', 'bread')],
      [aisle('a-21', '21'), aisle('a-1', '1')],
      [location('i-bread', 'a-21'), location('i-ghost', 'a-1')],
      undefined,
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ phrase: 'bread', aisleNumber: '21' });
  });

  it('drops a location whose aisle is unknown for the store', () => {
    const candidates = buildAisleCandidates(
      [item('i-bread', 'bread')],
      [aisle('a-1', '1')],
      [location('i-bread', 'a-missing')],
      undefined,
    );

    expect(candidates).toHaveLength(0);
  });

  it('includes the store-slug aliases alongside catalog candidates', () => {
    const withAliases = buildAisleCandidates(
      [item('i-bread', 'bread')],
      [aisle('a-21', '21')],
      [location('i-bread', 'a-21')],
      'oxford-62',
    );
    const withoutAliases = buildAisleCandidates(
      [item('i-bread', 'bread')],
      [aisle('a-21', '21')],
      [location('i-bread', 'a-21')],
      undefined,
    );

    // A known store slug contributes alias candidates on top of the catalog join.
    expect(withAliases.length).toBeGreaterThan(withoutAliases.length);
  });
});
