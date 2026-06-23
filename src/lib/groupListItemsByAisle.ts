import type { Aisle, ListItem } from '@/db/schema';

export interface AisleBucket {
  aisle: Aisle;
  listItems: ListItem[];
}

export interface GroupedListItems {
  /** Aisle buckets of unchecked items, sorted by `aisle.sort_order`. */
  buckets: AisleBucket[];
  /** Unchecked items with no resolvable aisle for the active store. */
  uncategorized: ListItem[];
  /** Checked items, in their original order. */
  checked: ListItem[];
}

/**
 * Pure bucketing of a list's items by aisle for the active store (ADR-0015).
 * Lists are store-agnostic; the caller resolves each item's aisle for the
 * active store and passes it in via `aisleByItem`.
 *
 * An unchecked item whose resolved `aisle_id` is empty — or absent from
 * `aisleById` — is collected in `uncategorized`. Checked items are collected
 * separately and excluded from the buckets.
 */
export function groupListItemsByAisle(
  listItems: ListItem[],
  ctx: { aisleById: Map<string, Aisle>; aisleByItem: Map<string, string> },
): GroupedListItems {
  const { aisleById, aisleByItem } = ctx;

  const unchecked = listItems.filter((li) => !li.checked);
  const checked = listItems.filter((li) => li.checked);

  const bucketMap = new Map<string, ListItem[]>();
  const uncategorized: ListItem[] = [];

  for (const li of unchecked) {
    const aisleId = aisleByItem.get(li.item_id) ?? '';
    if (!aisleId || !aisleById.has(aisleId)) {
      uncategorized.push(li);
    } else {
      const bucket = bucketMap.get(aisleId);
      if (bucket) {
        bucket.push(li);
      } else {
        bucketMap.set(aisleId, [li]);
      }
    }
  }

  const buckets: AisleBucket[] = [...bucketMap.entries()]
    .map(([aisleId, lis]) => ({ aisle: aisleById.get(aisleId)!, listItems: lis }))
    .sort((a, b) => a.aisle.sort_order - b.aisle.sort_order);

  return { buckets, uncategorized, checked };
}
