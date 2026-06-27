import type { Aisle, ListItem } from '@/db/schema';
import type { MatcherStatus } from '@/hooks/useAisleMatcher';

export interface AisleBucket {
  aisle: Aisle;
  listItems: ListItem[];
}

export interface GroupedListItems {
  /** Aisle buckets of unchecked items, sorted by `aisle.sort_order`. */
  buckets: AisleBucket[];
  /** Unchecked, unlocated items the matcher is still working on — never shown
   *  under "Uncategorized". */
  categorizing: ListItem[];
  /** Unchecked items with no resolvable aisle that have settled (the matcher
   *  ran and found nothing, or it failed). */
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
 * `aisleById` — is *categorizing* (the matcher is loading, or this item is
 * queued/in flight) or, once settled, *uncategorized*. "Uncategorized" is a
 * positively-confirmed terminal state, never a transient one. Checked items are
 * collected separately and excluded from the buckets.
 */
export function groupListItemsByAisle(
  listItems: ListItem[],
  ctx: {
    aisleById: Map<string, Aisle>;
    aisleByItem: Map<string, string>;
    categorizingIds: Set<string>;
    status: MatcherStatus;
  },
): GroupedListItems {
  const { aisleById, aisleByItem, categorizingIds, status } = ctx;

  const unchecked = listItems.filter((li) => !li.checked);
  const checked = listItems.filter((li) => li.checked);

  const bucketMap = new Map<string, ListItem[]>();
  const categorizing: ListItem[] = [];
  const uncategorized: ListItem[] = [];

  for (const li of unchecked) {
    const aisleId = aisleByItem.get(li.item_id) ?? '';
    const hasAisle = !!aisleId && aisleById.has(aisleId);
    if (hasAisle) {
      const bucket = bucketMap.get(aisleId);
      if (bucket) {
        bucket.push(li);
      } else {
        bucketMap.set(aisleId, [li]);
      }
      continue;
    }
    // In progress while the matcher is loading, or this item is queued/in flight.
    const isCategorizing = status === 'loading' || categorizingIds.has(li.item_id);
    if (isCategorizing) {
      categorizing.push(li);
    } else {
      uncategorized.push(li);
    }
  }

  const buckets: AisleBucket[] = [...bucketMap.entries()]
    .map(([aisleId, lis]) => ({ aisle: aisleById.get(aisleId)!, listItems: lis }))
    .sort((a, b) => a.aisle.sort_order - b.aisle.sort_order);

  return { buckets, categorizing, uncategorized, checked };
}
