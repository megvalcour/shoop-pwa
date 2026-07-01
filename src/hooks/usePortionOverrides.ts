/**
 * Remembered ingredient weights (Eat tab, Phase 4.1 — ADR-0004/0026). The user
 * only ever sizes a count/container ingredient once: whenever they resolve a row
 * (a portion pick or a typed weight) we remember grams-per-unit keyed by
 * `canonical_name|unit`, so the same ingredient auto-sizes in every future recipe.
 *
 * Persistence follows the `eat_profile` pattern exactly — a JSON blob under a
 * `preferences` key (`eat_portion_overrides`), so there is NO `DB_VERSION` bump and
 * no new object store. Reads are offline by construction (local IndexedDB only).
 *
 * The map is consumed by `toGrams` (via `useNutrition`), which takes the resolved
 * per-unit value as a plain argument — this module owns the IndexedDB access and
 * the key/gram math; `toGrams` stays a pure, I/O-free util.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { IDBPDatabase } from 'idb';
import { dbPromise, PORTION_OVERRIDES_KEY } from '@/db/idbClient';
import type { ShoopDB } from '@/db/schema';
import { overrideKey } from '@/utils/toGrams';

/** Grams for ONE unit of an ingredient, keyed by `overrideKey(name, unit)`. */
export type PortionOverrides = Record<string, number>;

export const PORTION_OVERRIDES_QUERY_KEY = ['eat', 'portionOverrides'] as const;

/** Parse the stored blob into a map, tolerating an unset/corrupt value (→ `{}`). */
function parseOverrides(value: string | undefined): PortionOverrides {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: PortionOverrides = {};
    for (const [key, grams] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof grams === 'number' && Number.isFinite(grams) && grams > 0) out[key] = grams;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Read the full remembered-weights map (offline). Standalone (not a hook) so the
 * enrichment mutations in `useNutrition` can load it once before sizing rows.
 */
export async function readPortionOverrides(
  db?: IDBPDatabase<ShoopDB>,
): Promise<PortionOverrides> {
  const database = db ?? (await dbPromise);
  const pref = await database.get('preferences', PORTION_OVERRIDES_KEY);
  return parseOverrides(pref?.value);
}

export interface RememberPortionInput {
  canonical_name: string;
  unit: string;
  /** Total grams the user resolved for `quantity` of this ingredient. */
  grams: number;
  /** The ingredient's quantity, so we can store a per-UNIT weight. */
  quantity: number;
}

/**
 * Upsert one remembered per-unit weight (`grams / quantity`) into the map, in a
 * single read-modify-write transaction. A non-positive quantity or grams is a
 * no-op (we never remember a zero/garbage weight). Shared by the hook below and by
 * `useNutrition`'s manual-resolve mutation so the write path exists once.
 */
export async function writePortionOverride(
  db: IDBPDatabase<ShoopDB>,
  input: RememberPortionInput,
): Promise<void> {
  if (!(input.quantity > 0) || !(input.grams > 0)) return;
  const perUnit = input.grams / input.quantity;
  const key = overrideKey(input.canonical_name, input.unit);

  const tx = db.transaction('preferences', 'readwrite');
  const store = tx.objectStore('preferences');
  const pref = await store.get(PORTION_OVERRIDES_KEY);
  const map = parseOverrides(pref?.value);
  map[key] = perUnit;
  await store.put({ key: PORTION_OVERRIDES_KEY, value: JSON.stringify(map) });
  await tx.done;
}

/** The remembered-weights map, as a TanStack Query (offline-safe). */
export function usePortionOverrides() {
  return useQuery({
    queryKey: PORTION_OVERRIDES_QUERY_KEY,
    queryFn: () => readPortionOverrides(),
  });
}

/** Remember a resolved weight, then refresh the map so future sizing sees it. */
export function useRememberPortion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RememberPortionInput) => {
      const db = await dbPromise;
      await writePortionOverride(db, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PORTION_OVERRIDES_QUERY_KEY });
    },
  });
}
