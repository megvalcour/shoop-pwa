import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import type { Recipe, RecipeIngredient } from '@/db/schema';

/**
 * Persistent recipe data layer (Eat tab, Phase 3 — ADR-0004/0026). All recipe
 * reads/writes go through these TanStack Query hooks backed by IndexedDB; query
 * keys + caching live here only. A recipe and its ingredient lines always commit
 * (and cascade-delete) in ONE transaction so the `recipe_ingredients` rows can
 * never orphan their parent `recipe`.
 */

const RECIPES_KEY = ['recipes'] as const;

/** A library row: the recipe plus its ingredient-line count for the card subtitle. */
export interface RecipeSummary extends Recipe {
  ingredientCount: number;
}

/** The library: all recipes (with ingredient counts), newest first. */
export function useRecipes() {
  return useQuery({
    queryKey: RECIPES_KEY,
    queryFn: async (): Promise<RecipeSummary[]> => {
      const db = await dbPromise;
      const [recipes, ingredients] = await Promise.all([
        db.getAll('recipes'),
        db.getAll('recipe_ingredients'),
      ]);
      const counts = new Map<string, number>();
      for (const ingredient of ingredients) {
        counts.set(ingredient.recipe_id, (counts.get(ingredient.recipe_id) ?? 0) + 1);
      }
      return recipes
        .map((recipe) => ({ ...recipe, ingredientCount: counts.get(recipe.id) ?? 0 }))
        .sort((a, b) => b.created_at - a.created_at);
    },
  });
}

export interface RecipeWithIngredients {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
}

/**
 * A single recipe plus its ingredient lines (via the `recipe_ingredients`
 * `recipe_id` index). Returns null when the id is unknown. Disabled until an id
 * is supplied so the detail route can call it unconditionally.
 */
export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: [...RECIPES_KEY, id] as const,
    enabled: id !== undefined,
    queryFn: async (): Promise<RecipeWithIngredients | null> => {
      const db = await dbPromise;
      const recipe = await db.get('recipes', id!);
      if (!recipe) return null;
      const ingredients = await db.getAllFromIndex('recipe_ingredients', 'recipe_id', id!);
      return { recipe, ingredients };
    },
  });
}

/** One ingredient line as supplied by the import preview or the manual form. */
export interface RecipeIngredientInput {
  /** Original ingredient line, preserved for display. */
  raw: string;
  /** Normalized noun phrase (`normalizeIngredient`); stored lower-cased. */
  name: string;
  quantity: number;
  unit: string;
}

export interface SaveRecipeInput {
  title: string;
  source_url?: string;
  servings: number;
  ingredients: RecipeIngredientInput[];
}

/** Build the `recipe_ingredients` rows for a recipe from the form/import input. */
function buildIngredientRows(
  recipeId: string,
  ingredients: RecipeIngredientInput[],
): RecipeIngredient[] {
  return ingredients.map((ingredient) => ({
    id: crypto.randomUUID(),
    recipe_id: recipeId,
    raw: ingredient.raw,
    canonical_name: ingredient.name.trim().toLowerCase(),
    quantity: ingredient.quantity,
    unit: ingredient.unit.trim(),
  }));
}

/** Create a recipe + its ingredient lines in one transaction. */
export function useSaveRecipe() {
  const queryClient = useQueryClient();
  return useMutation<Recipe, Error, SaveRecipeInput>({
    mutationFn: async (input): Promise<Recipe> => {
      const db = await dbPromise;
      const recipe: Recipe = {
        id: crypto.randomUUID(),
        title: input.title.trim(),
        source_url: input.source_url,
        servings: input.servings,
        created_at: Date.now(),
      };
      const rows = buildIngredientRows(recipe.id, input.ingredients);

      const tx = db.transaction(['recipes', 'recipe_ingredients'], 'readwrite');
      tx.objectStore('recipes').add(recipe);
      for (const row of rows) tx.objectStore('recipe_ingredients').add(row);
      await tx.done;

      return recipe;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECIPES_KEY }),
  });
}

export interface UpdateRecipeInput extends SaveRecipeInput {
  id: string;
}

/**
 * Replace a recipe row and its ingredient lines atomically: the old
 * `recipe_ingredients` (looked up by the `recipe_id` index) are deleted and the
 * new set added in the same transaction, so an edit never leaves stale or orphan
 * lines. `created_at` is preserved from the existing row.
 */
export function useUpdateRecipe() {
  const queryClient = useQueryClient();
  return useMutation<Recipe, Error, UpdateRecipeInput>({
    mutationFn: async (input): Promise<Recipe> => {
      const db = await dbPromise;
      const existing = await db.get('recipes', input.id);
      if (!existing) throw new Error(`Recipe not found: ${input.id}`);

      const recipe: Recipe = {
        ...existing,
        title: input.title.trim(),
        source_url: input.source_url,
        servings: input.servings,
      };
      const rows = buildIngredientRows(recipe.id, input.ingredients);

      const tx = db.transaction(['recipes', 'recipe_ingredients'], 'readwrite');
      const oldKeys = await tx
        .objectStore('recipe_ingredients')
        .index('recipe_id')
        .getAllKeys(recipe.id);
      for (const key of oldKeys) tx.objectStore('recipe_ingredients').delete(key);
      tx.objectStore('recipes').put(recipe);
      for (const row of rows) tx.objectStore('recipe_ingredients').add(row);
      await tx.done;

      return recipe;
    },
    onSuccess: (recipe) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: RECIPES_KEY }),
        queryClient.invalidateQueries({ queryKey: [...RECIPES_KEY, recipe.id] }),
      ]),
  });
}

/** Delete a recipe and cascade its `recipe_ingredients` in one transaction. */
export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const db = await dbPromise;
      const tx = db.transaction(['recipes', 'recipe_ingredients'], 'readwrite');
      const ingredientKeys = await tx
        .objectStore('recipe_ingredients')
        .index('recipe_id')
        .getAllKeys(id);
      tx.objectStore('recipes').delete(id);
      for (const key of ingredientKeys) tx.objectStore('recipe_ingredients').delete(key);
      await tx.done;
    },
    onSuccess: (_data, id) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: RECIPES_KEY }),
        queryClient.invalidateQueries({ queryKey: [...RECIPES_KEY, id] }),
      ]),
  });
}
