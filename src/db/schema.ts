import type { DBSchema } from 'idb';

export const DB_NAME = 'shoop';
export const DB_VERSION = 1;

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
  aisle_id: string;
  store_id: string;
}

export interface DefaultListEntry {
  id: string;
  item_id: string;
  quantity: number;
  unit: string;
  notes: string;
}

export interface WeeklyListEntry {
  id: string;
  week_start: string;
  item_id: string;
  quantity: number;
  checked: boolean;
  added_from_default: boolean;
}

export interface ShoopDB extends DBSchema {
  stores: { key: string; value: Store; indexes: Record<never, never> };
  aisles: { key: string; value: Aisle; indexes: { store_id: string } };
  items: { key: string; value: Item; indexes: { aisle_id: string; store_id: string } };
  default_list: { key: string; value: DefaultListEntry; indexes: Record<never, never> };
  weekly_list: { key: string; value: WeeklyListEntry; indexes: Record<never, never> };
}
