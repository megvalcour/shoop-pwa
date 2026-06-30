/**
 * Weekly meal-plan data layer (Eat tab, Phase 5 — ADR-0004/0026/0029). All
 * reads/writes of the `meal_plan_entries` store go through these TanStack Query
 * hooks; query keys + caching live here only. This is the first phase to exercise
 * the store (created empty by the v9 migration) — it writes to it but changes NO
 * store shape, so there is NO `DB_VERSION` bump.
 *
 * Entirely offline by construction: the plan is pure IndexedDB, so building and
 * reading the week needs no network (ADR-0001). Each entry places one recipe on
 * one day-of-week (`DayKey`) with a `planned_servings` count; the read joins each
 * entry to its recipe and groups by day, defensively skipping any entry whose
 * recipe no longer exists (belt-and-suspenders alongside the delete cascade).
 *
 * Mutations invalidate both the plan key and the meal-plan nutrition key so the
 * scored week never drifts from the planned week.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import type { MealPlanEntry, Recipe } from '@/db/schema';
import { DAY_KEYS, emptyByDay, isDayKey, type DayKey } from '@/services/mealPlanDays';
import { MEAL_PLAN_NUTRITION_KEY } from '@/hooks/useMealPlanNutrition';

export const MEAL_PLAN_KEY = ['meal-plan'] as const;

/** One placed recipe: its plan entry joined to the recipe it points at. */
export interface PlannedRecipe {
  entry: MealPlanEntry;
  recipe: Recipe;
}

/** The week, grouped by day in grid order. Every day key is present (possibly empty). */
export interface WeeklyMealPlan {
  byDay: Record<DayKey, PlannedRecipe[]>;
  /** Total placed recipes across the week (orphan entries excluded). */
  entryCount: number;
}

/** Read the full week, joined to recipes and grouped by day. Offline-safe. */
export function useMealPlan() {
  return useQuery({
    queryKey: MEAL_PLAN_KEY,
    queryFn: async (): Promise<WeeklyMealPlan> => {
      const db = await dbPromise;
      const [entries, recipes] = await Promise.all([
        db.getAll('meal_plan_entries'),
        db.getAll('recipes'),
      ]);
      const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

      const byDay = emptyByDay<PlannedRecipe[]>(() => []);
      let entryCount = 0;
      for (const entry of entries) {
        const recipe = recipeById.get(entry.recipe_id);
        // Skip orphan (deleted recipe) or off-grid (legacy/unknown day) entries.
        if (!recipe || !isDayKey(entry.day)) continue;
        byDay[entry.day].push({ entry, recipe });
        entryCount += 1;
      }
      return { byDay, entryCount };
    },
  });
}

/** Invalidate the plan AND its nutrition rollup after any plan mutation. */
function invalidatePlan(queryClient: ReturnType<typeof useQueryClient>): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: MEAL_PLAN_KEY }),
    queryClient.invalidateQueries({ queryKey: MEAL_PLAN_NUTRITION_KEY }),
  ]);
}

export interface AddToPlanInput {
  recipeId: string;
  day: DayKey;
  plannedServings: number;
}

/** Place a recipe on a day with a planned-servings count (one new entry). */
export function useAddToPlan() {
  const queryClient = useQueryClient();
  return useMutation<MealPlanEntry, Error, AddToPlanInput>({
    mutationFn: async ({ recipeId, day, plannedServings }) => {
      const db = await dbPromise;
      const entry: MealPlanEntry = {
        id: crypto.randomUUID(),
        recipe_id: recipeId,
        day,
        planned_servings: Math.max(1, Math.round(plannedServings)),
      };
      await db.add('meal_plan_entries', entry);
      return entry;
    },
    onSuccess: () => invalidatePlan(queryClient),
  });
}

export interface UpdatePlanServingsInput {
  entryId: string;
  plannedServings: number;
}

/** Change one placed recipe's planned servings (clamped to ≥1). */
export function useUpdatePlanServings() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdatePlanServingsInput>({
    mutationFn: async ({ entryId, plannedServings }) => {
      const db = await dbPromise;
      const entry = await db.get('meal_plan_entries', entryId);
      if (!entry) throw new Error(`Meal plan entry not found: ${entryId}`);
      await db.put('meal_plan_entries', {
        ...entry,
        planned_servings: Math.max(1, Math.round(plannedServings)),
      });
    },
    onSuccess: () => invalidatePlan(queryClient),
  });
}

/** Remove one placed recipe from the plan. */
export function useRemoveFromPlan() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (entryId) => {
      const db = await dbPromise;
      await db.delete('meal_plan_entries', entryId);
    },
    onSuccess: () => invalidatePlan(queryClient),
  });
}

/** Clear the whole week. */
export function useClearPlan() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const db = await dbPromise;
      const tx = db.transaction('meal_plan_entries', 'readwrite');
      const keys = await tx.store.getAllKeys();
      for (const key of keys) tx.store.delete(key);
      await tx.done;
    },
    onSuccess: () => invalidatePlan(queryClient),
  });
}

export { DAY_KEYS };
