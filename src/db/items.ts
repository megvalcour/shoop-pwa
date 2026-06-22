import type { Item } from '@/db/schema';

export interface ResolvedItem {
  /** Existing catalog item id, or a freshly-minted id when the name is novel. */
  itemId: string;
  /** True when no catalog item matched the canonical name. */
  itemCreated: boolean;
  /**
   * The `items` row to insert when `itemCreated` is true. Returned rather than
   * written so the caller can add it inside its own transaction, keeping the
   * item insert atomic with whatever references it (a `list_items` or
   * `default_list` row).
   */
  newItem?: Item;
}

/**
 * Resolve a typed item name against the store-agnostic catalog (ADR-0015):
 * reuse the existing `items` row when the canonical name matches, otherwise
 * describe a new one. Pure — does no IO — so it can be called inside the read
 * phase of any mutation and its `newItem` written within that mutation's
 * transaction.
 */
export function resolveItem(allItems: Item[], trimmedName: string): ResolvedItem {
  const canonical = trimmedName.toLowerCase();
  const existing = allItems.find((i) => i.canonical_name === canonical);
  if (existing) {
    return { itemId: existing.id, itemCreated: false };
  }
  const itemId = crypto.randomUUID();
  return {
    itemId,
    itemCreated: true,
    newItem: { id: itemId, name: trimmedName, canonical_name: canonical },
  };
}
