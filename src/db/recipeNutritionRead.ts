/**
 * Shared, offline read that joins a recipe's ingredient lines to their cached FDC
 * panels (Eat tab — ADR-0026/0027). Extracted from `useRecipeNutrition` (Phase 4)
 * so BOTH the recipe-detail score and the Phase 5 meal-plan score build their
 * per-serving totals from ONE code path — a recipe can never score differently on
 * its detail page than it does inside the weekly plan.
 *
 * Pure IndexedDB read, no network: every input it returns comes from already
 * persisted data (`recipes`, `recipe_ingredients`, `nutrition_cache`), so the
 * rollups computed from it work fully offline. All IndexedDB access lives in
 * `db/`/`hooks/` (AGENTS.md); this module is the `db/` half.
 */

import type { IDBPDatabase } from 'idb';
import type { FdcNutrientPanel, ShoopDB } from '@/db/schema';
import type { RollupIngredient } from '@/services/nutritionRollup';

/** One ingredient joined to its cached panel (when matched), plus its display name. */
export interface JoinedIngredient {
  /** The original ingredient row (carries `grams`, `fdc_id`, `unit`, …). */
  ingredient: ShoopDB['recipe_ingredients']['value'];
  /** Capitalized display name, derived from `canonical_name`. */
  name: string;
  /** The cached per-100 g panel when the ingredient is matched + cached. */
  panel?: FdcNutrientPanel;
}

/** A recipe's servings plus its panel-joined ingredient lines, ready to roll up. */
export interface RecipeRollupSource {
  servings: number;
  ingredients: JoinedIngredient[];
}

/** Capitalize a stored (lower-cased) canonical name for display in lists. */
export function displayName(canonical: string): string {
  return canonical.replace(/[a-z]/i, (ch) => ch.toUpperCase());
}

/**
 * Read a recipe + its ingredient lines and join each matched ingredient to its
 * cached panel. Returns `null` when the recipe id is unknown (a deleted recipe an
 * orphan plan entry still points at — the caller skips it). Distinct `fdc_id`s are
 * fetched once and shared across rows.
 */
export async function readRecipeRollupSource(
  db: IDBPDatabase<ShoopDB>,
  recipeId: string,
): Promise<RecipeRollupSource | null> {
  const recipe = await db.get('recipes', recipeId);
  if (!recipe) return null;
  const ingredients = await db.getAllFromIndex('recipe_ingredients', 'recipe_id', recipeId);

  const panels = new Map<string, FdcNutrientPanel>();
  for (const ingredient of ingredients) {
    if (ingredient.fdc_id && !panels.has(ingredient.fdc_id)) {
      const entry = await db.get('nutrition_cache', ingredient.fdc_id);
      if (entry) panels.set(ingredient.fdc_id, entry.payload);
    }
  }

  return {
    servings: recipe.servings,
    ingredients: ingredients.map((ingredient) => ({
      ingredient,
      name: displayName(ingredient.canonical_name),
      panel: ingredient.fdc_id ? panels.get(ingredient.fdc_id) : undefined,
    })),
  };
}

/** Adapt joined ingredients into the `computeNutritionRollup` input shape. */
export function toRollupIngredients(ingredients: JoinedIngredient[]): RollupIngredient[] {
  return ingredients.map(({ name, ingredient, panel }) => ({
    name,
    grams: ingredient.grams,
    panel,
  }));
}
