import type { DBSchema } from 'idb';

export const DB_NAME = 'shoop';
export const DB_VERSION = 9;

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

/**
 * A persisted recipe (Eat tab, Phase 3 — ADR-0026). Either imported from a URL
 * (`source_url` present) or hand-entered. The ingredient lines live in the
 * `recipe_ingredients` store, scoped by `recipe_id`. `servings` is the recipe's
 * yield; per-serving nutrition math (Phase 4/5) divides by it.
 */
export interface Recipe {
  id: string; // PK, uuid
  title: string;
  source_url?: string; // present when imported from a URL
  servings: number; // yield; per-serving math (Phase 4/5) divides by this
  created_at: number; // epoch ms
}

/**
 * One ingredient line of a `Recipe` (ADR-0026). Carries the original raw line for
 * display, the `normalizeIngredient` noun phrase for matching/display, and the
 * quantity + unit recovered by `parseIngredientMeasure` (a recipe-scoped parser,
 * separate from `normalizeIngredient` per ADR-0021). `item_id`, `grams`, and
 * `fdc_id` stay undefined until Phase 4 enrichment.
 */
export interface RecipeIngredient {
  id: string; // PK, uuid
  recipe_id: string; // Index → recipes.id
  raw: string; // original ingredient line, preserved for display
  canonical_name: string; // normalizeIngredient name, lower-cased for matching
  item_id?: string; // Index → items.id when matched (Phase 4; undefined now)
  quantity: number; // extracted value (parseIngredientMeasure; default 1)
  unit: string; // extracted unit token ('' when none)
  grams?: number; // resolved by Phase 4 enrichment (undefined now)
  fdc_id?: string; // resolved FDC food (Phase 4; undefined now)
}

/**
 * A recipe placed on a day of the weekly meal plan (ADR-0026). The store is
 * CREATED by the v9 migration but UNUSED until Phase 5 — no hook or UI reads or
 * writes it this phase. Typed here so the created store stays fully typed.
 */
export interface MealPlanEntry {
  id: string; // PK, uuid
  recipe_id: string; // Index → recipes.id
  day: string; // day-of-week or ISO date (Phase 5 decides)
  planned_servings: number;
}

/**
 * A single household-measure portion from FDC `foodPortions` (e.g. "1 cup" weighs
 * 160 g). Used by `toGrams` for the count/container conversion path (Phase 4).
 */
export interface FdcPortion {
  unit: string;
  gramWeight: number;
  amount: number;
}

/**
 * The per-100 g nutrient panel Shoop caches for a matched FDC food (Eat tab,
 * Phase 4 — ADR-0026/0027). This is the client's copy of the shape produced by
 * the pure `functions/_lib/parseFdcFood.ts` parser; the two module trees can't
 * share an import (functions build with no `@` alias), so this interface MUST be
 * kept in lock-step with that one.
 *
 * The `per100g` keys are deliberately the SAME identifiers the `nutritionTargets`
 * micro panel uses (`fiber`, `sodium`, `calcium`, …) so the Phase 5
 * rollup-vs-target join is a key match, not a mapping table.
 */
export interface FdcNutrientPanel {
  fdc_id: string;
  description: string; // FDC food description (shown in the manual picker)
  per100g: {
    energyKcal: number;
    protein: number; // g
    fat: number; // g
    carbs: number; // g
    fiber: number; // g
    sodium: number; // mg
    calcium: number; // mg
    iron: number; // mg
    potassium: number; // mg
    vitaminC: number; // mg
    vitaminD: number; // mcg
  };
  foodPortions?: FdcPortion[];
}

/**
 * A cached USDA FoodData Central nutrition payload (ADR-0026/0027). Keyed by the
 * external FDC food id, so the same food fetched for two recipes caches once; the
 * `query` (an ingredient's `canonical_name`) that first resolved here is kept so a
 * later ingredient with the same query reuses the food offline. Written by Phase 4
 * enrichment (`useNutrition`); the v9 store shape is unchanged — only `payload`'s
 * type is pinned down from `unknown` to {@link FdcNutrientPanel} (a type-level
 * refinement, NOT a migration: `DB_VERSION` stays 9).
 */
export interface NutritionCacheEntry {
  fdc_id: string; // PK, external (USDA FDC food id)
  payload: FdcNutrientPanel; // per-100g nutrient panel + foodPortions
  query: string; // normalized ingredient query that resolved here
  fetched_at: number; // epoch ms, future staleness policy
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
  recipes: { key: string; value: Recipe; indexes: Record<never, never> };
  recipe_ingredients: {
    key: string;
    value: RecipeIngredient;
    indexes: { recipe_id: string; item_id: string };
  };
  meal_plan_entries: {
    key: string;
    value: MealPlanEntry;
    indexes: { recipe_id: string };
  };
  nutrition_cache: {
    key: string;
    value: NutritionCacheEntry;
    indexes: Record<never, never>;
  };
}
