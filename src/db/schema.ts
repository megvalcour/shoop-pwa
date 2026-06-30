import type { DBSchema } from 'idb';

export const DB_NAME = 'shoop';
export const DB_VERSION = 8;

export interface Store {
  id: string;
  name: string;
  address: string;
  slug: string;
}

export interface Aisle {
  id: string;
  store_id: string;
  number: string;
  label: string;
  sort_order: number;
}

export interface Item {
  id: string;
  name: string;
  canonical_name: string;
}

/**
 * Per-store aisle assignment for a catalog item (see ADR-0015). A row existing
 * for `(item_id, store_id)` is the override lock signal that protects a manual
 * aisle pick from being clobbered by a late auto-classify at that store.
 */
export interface ItemLocation {
  id: string;
  item_id: string;
  store_id: string;
  aisle_id: string;
}

/** A persisted user/app preference, e.g. `active_store_id`. */
export interface Preference {
  key: string;
  value: string;
}

export type Sex = 'female' | 'male';
export type ActivityLevel =
  | 'sedentary' // 1.2
  | 'light' // 1.375
  | 'moderate' // 1.55
  | 'active' // 1.725
  | 'very_active'; // 1.9
export type UnitSystem = 'imperial' | 'metric';

/**
 * The single user's body/lifestyle profile (Eat tab, Phase 2). Persisted as JSON
 * under the `eat_profile` key in the `preferences` store — deliberately NOT a
 * dedicated object store, so Phase 2 ships schema-free (no `DB_VERSION` bump;
 * ADR-0026's reserved Eat stores stay for Phase 3/4).
 *
 * Canonical fields are METRIC (kg, cm); `units` records only the user's preferred
 * DISPLAY system so the form re-renders in their chosen units. The targets math
 * always runs on the metric fields, so toggling display units never drifts the
 * stored value.
 */
export interface EatProfile {
  age: number; // years
  sex: Sex;
  weightKg: number; // canonical metric
  heightCm: number; // canonical metric
  activity: ActivityLevel;
  units: UnitSystem; // display preference only
  updated_at: number; // epoch ms
}

export interface DefaultListEntry {
  id: string;
  item_id: string;
  quantity: number;
  unit: string;
  notes: string;
}

export interface ShoppingList {
  id: string;
  name: string;
  created_at: string;
}

export interface ListItem {
  id: string;
  list_id: string;
  item_id: string;
  quantity: number;
  unit: string;
  checked: boolean;
  added_from_default: boolean;
  created_at: number;
}

export interface ShoopDB extends DBSchema {
  stores: { key: string; value: Store; indexes: Record<never, never> };
  aisles: { key: string; value: Aisle; indexes: { store_id: string } };
  items: { key: string; value: Item; indexes: Record<never, never> };
  item_locations: {
    key: string;
    value: ItemLocation;
    indexes: { item_id: string; store_id: string };
  };
  preferences: { key: string; value: Preference; indexes: Record<never, never> };
  default_list: { key: string; value: DefaultListEntry; indexes: Record<never, never> };
  shopping_lists: { key: string; value: ShoppingList; indexes: Record<never, never> };
  list_items: { key: string; value: ListItem; indexes: { list_id: string } };
}
