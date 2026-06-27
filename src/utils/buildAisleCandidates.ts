import type { Aisle, Item, ItemLocation } from '@/db/schema';
import { buildCandidates, type Candidate } from '@/services/classifier';
import { aliasesForSlug } from '@/services/aisleAliases';

/**
 * Build the active store's matcher candidate set (ADR-0015): the store's
 * item→aisle map (joined from `item_locations`) plus that store's aliases.
 *
 * Pure transform — no IndexedDB, no model. The catalog join uses each item's
 * `canonical_name` for the located item; items without a usable name are
 * dropped, exactly as the matcher expects.
 */
export function buildAisleCandidates(
  items: Item[],
  aisles: Aisle[],
  locations: ItemLocation[],
  storeSlug: string | undefined,
): Candidate[] {
  const canonicalById = new Map(items.map((i) => [i.id, i.canonical_name]));
  const catalogInput = locations
    .map((loc) => ({
      canonical_name: canonicalById.get(loc.item_id) ?? '',
      aisle_id: loc.aisle_id,
    }))
    .filter((c) => c.canonical_name);
  const aisleById = new Map(aisles.map((a) => [a.id, a.number]));
  return buildCandidates(catalogInput, aliasesForSlug(storeSlug), aisleById);
}
