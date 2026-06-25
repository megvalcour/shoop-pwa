import { describe, it, expect } from 'vitest';
import { groupListItemsByAisle } from '@/lib/groupListItemsByAisle';
import type { MatcherStatus } from '@/hooks/useAisleMatcher';
import type { Aisle, ListItem } from '@/db/schema';

// Default ephemeral signal: matcher settled ready with nothing in flight, so an
// unlocated item lands in `uncategorized` unless a case overrides these.
function ctx(opts: {
  aisleById?: Map<string, Aisle>;
  aisleByItem?: Map<string, string>;
  categorizingIds?: Set<string>;
  status?: MatcherStatus;
}) {
  return {
    aisleById: opts.aisleById ?? new Map<string, Aisle>(),
    aisleByItem: opts.aisleByItem ?? new Map<string, string>(),
    categorizingIds: opts.categorizingIds ?? new Set<string>(),
    status: opts.status ?? 'ready',
  };
}

function aisle(id: string, sort_order: number): Aisle {
  return { id, store_id: 'store-1', number: String(sort_order), label: id, sort_order };
}

function listItem(id: string, item_id: string, checked = false): ListItem {
  return {
    id,
    list_id: 'list-1',
    item_id,
    quantity: 1,
    unit: '',
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
      ctx({ aisleById, aisleByItem }),
    );

    expect(buckets.map((b) => b.aisle.id)).toEqual(['a-dairy', 'a-bread']);
  });

  it('puts a settled item with an empty aisle id in uncategorized', () => {
    const { uncategorized } = groupListItemsByAisle([listItem('li-1', 'item-1')], ctx({}));

    expect(uncategorized.map((li) => li.id)).toEqual(['li-1']);
  });

  it('puts a settled item whose aisle id is missing from aisleById in uncategorized', () => {
    const { uncategorized, buckets } = groupListItemsByAisle(
      [listItem('li-1', 'item-1')],
      ctx({ aisleByItem: new Map([['item-1', 'a-missing']]) }),
    );

    expect(uncategorized.map((li) => li.id)).toEqual(['li-1']);
    expect(buckets).toHaveLength(0);
  });

  it('puts an unlocated unchecked item in categorizing (not uncategorized) while loading', () => {
    const { categorizing, uncategorized } = groupListItemsByAisle(
      [listItem('li-1', 'item-1')],
      ctx({ status: 'loading' }),
    );

    expect(categorizing.map((li) => li.id)).toEqual(['li-1']);
    expect(uncategorized).toHaveLength(0);
  });

  it('puts an item whose id is in categorizingIds in categorizing even when ready', () => {
    const { categorizing, uncategorized } = groupListItemsByAisle(
      [listItem('li-1', 'item-1')],
      ctx({ status: 'ready', categorizingIds: new Set(['item-1']) }),
    );

    expect(categorizing.map((li) => li.id)).toEqual(['li-1']);
    expect(uncategorized).toHaveLength(0);
  });

  it('settles an unlocated item to uncategorized when failed and not in the set', () => {
    const { categorizing, uncategorized } = groupListItemsByAisle(
      [listItem('li-1', 'item-1')],
      ctx({ status: 'failed' }),
    );

    expect(categorizing).toHaveLength(0);
    expect(uncategorized.map((li) => li.id)).toEqual(['li-1']);
  });

  it('keeps a located item in its aisle bucket regardless of categorizing signal', () => {
    const aisleById = new Map([['a-dairy', aisle('a-dairy', 1)]]);
    const aisleByItem = new Map([['item-milk', 'a-dairy']]);

    const { buckets, categorizing } = groupListItemsByAisle(
      [listItem('li-1', 'item-milk')],
      ctx({ aisleById, aisleByItem, status: 'loading', categorizingIds: new Set(['item-milk']) }),
    );

    expect(buckets[0].listItems.map((li) => li.id)).toEqual(['li-1']);
    expect(categorizing).toHaveLength(0);
  });

  it('collects checked items separately and excludes them from buckets', () => {
    const aisleById = new Map([['a-dairy', aisle('a-dairy', 1)]]);
    const aisleByItem = new Map([
      ['item-milk', 'a-dairy'],
      ['item-eggs', 'a-dairy'],
    ]);

    const { buckets, checked } = groupListItemsByAisle(
      [listItem('li-1', 'item-milk'), listItem('li-2', 'item-eggs', true)],
      ctx({ aisleById, aisleByItem }),
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
      ctx({ aisleById, aisleByItem }),
    );

    expect(buckets[0].listItems.map((li) => li.id)).toEqual(['li-1', 'li-2']);
  });
});
