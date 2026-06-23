import { describe, it, expect } from 'vitest';
import { groupListItemsByAisle } from '@/lib/groupListItemsByAisle';
import type { Aisle, ListItem } from '@/db/schema';

function aisle(id: string, sort_order: number): Aisle {
  return { id, store_id: 'store-1', number: String(sort_order), label: id, sort_order };
}

function listItem(id: string, item_id: string, checked = false): ListItem {
  return {
    id,
    list_id: 'list-1',
    item_id,
    quantity: 1,
    checked,
    added_from_default: false,
    created_at: 0,
  };
}

describe('groupListItemsByAisle', () => {
  it('buckets unchecked items by aisle, sorted by sort_order', () => {
    const aisleById = new Map([
      ['a-bread', aisle('a-bread', 21)],
      ['a-dairy', aisle('a-dairy', 1)],
    ]);
    const aisleByItem = new Map([
      ['item-bread', 'a-bread'],
      ['item-milk', 'a-dairy'],
    ]);

    const { buckets } = groupListItemsByAisle(
      [listItem('li-1', 'item-bread'), listItem('li-2', 'item-milk')],
      { aisleById, aisleByItem },
    );

    expect(buckets.map((b) => b.aisle.id)).toEqual(['a-dairy', 'a-bread']);
  });

  it('puts an item with an empty aisle id in uncategorized', () => {
    const { uncategorized } = groupListItemsByAisle([listItem('li-1', 'item-1')], {
      aisleById: new Map(),
      aisleByItem: new Map(),
    });

    expect(uncategorized.map((li) => li.id)).toEqual(['li-1']);
  });

  it('puts an item whose aisle id is missing from aisleById in uncategorized', () => {
    const { uncategorized, buckets } = groupListItemsByAisle([listItem('li-1', 'item-1')], {
      aisleById: new Map(),
      aisleByItem: new Map([['item-1', 'a-missing']]),
    });

    expect(uncategorized.map((li) => li.id)).toEqual(['li-1']);
    expect(buckets).toHaveLength(0);
  });

  it('collects checked items separately and excludes them from buckets', () => {
    const aisleById = new Map([['a-dairy', aisle('a-dairy', 1)]]);
    const aisleByItem = new Map([
      ['item-milk', 'a-dairy'],
      ['item-eggs', 'a-dairy'],
    ]);

    const { buckets, checked } = groupListItemsByAisle(
      [listItem('li-1', 'item-milk'), listItem('li-2', 'item-eggs', true)],
      { aisleById, aisleByItem },
    );

    expect(checked.map((li) => li.id)).toEqual(['li-2']);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].listItems.map((li) => li.id)).toEqual(['li-1']);
  });

  it('preserves order of multiple items within a single aisle', () => {
    const aisleById = new Map([['a-dairy', aisle('a-dairy', 1)]]);
    const aisleByItem = new Map([
      ['item-milk', 'a-dairy'],
      ['item-eggs', 'a-dairy'],
    ]);

    const { buckets } = groupListItemsByAisle(
      [listItem('li-1', 'item-milk'), listItem('li-2', 'item-eggs')],
      { aisleById, aisleByItem },
    );

    expect(buckets[0].listItems.map((li) => li.id)).toEqual(['li-1', 'li-2']);
  });
});
