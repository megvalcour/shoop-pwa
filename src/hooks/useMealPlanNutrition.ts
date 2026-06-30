/**
 * Weekly-plan nutrition + scoring (Eat tab, Phase 5 — ADR-0004/0026/0027/0029).
 * Reads the plan and EVERY referenced recipe's persisted nutrition in ONE query,
 * builds a `perServingByRecipeId` map (via the shared `readRecipeRollupSource`
 * join + `computeNutritionRollup`, the SAME path the recipe-detail score uses),
 * then sums each day and scores it against the Phase 2 daily targets — plus a
 * weekly average-per-day summary.
 *
 * One query does all joins on purpose: calling `useRecipeNutrition` once per
 * planned recipe would vary the hook count per render and break the rules of
 * hooks. Offline by construction (pure IndexedDB reads); a planned-but-unenriched
 * recipe simply contributes its partial total and is flagged — scoring never
 * throws. Targets are passed in (the organism owns the profile→targets compute),
 * so editing the profile re-keys the query and re-scores; with `null` targets the
 * plan still sums but scores are withheld ("set up your profile to score").
 */

import { useQuery } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import { readRecipeRollupSource, toRollupIngredients } from '@/db/recipeNutritionRead';
import { computeNutritionRollup, emptyTotals, type NutrientTotals } from '@/services/nutritionRollup';
import {
  flattenTargets,
  scoreTotals,
  sumDayTotals,
  weeklyAveragePerDay,
  type NutrientScore,
} from '@/services/mealPlanScore';
import { DAY_KEYS, emptyByDay, isDayKey, type DayKey } from '@/services/mealPlanDays';
import type { NutritionTargets } from '@/services/nutritionTargets';

export const MEAL_PLAN_NUTRITION_KEY = ['meal-plan-nutrition'] as const;

/** A recipe's enrichment progress, for the "enrich to score" affordance. */
export type RecipeEnrichmentStatus = 'enriched' | 'partial' | 'unenriched';

export interface RecipeEnrichment {
  recipeId: string;
  title: string;
  enrichedCount: number;
  totalCount: number;
  status: RecipeEnrichmentStatus;
}

export interface DayScore {
  totals: NutrientTotals;
  /** Null when there are no targets (no profile). */
  scores: NutrientScore[] | null;
  entryCount: number;
}

export interface WeeklySummary {
  totals: NutrientTotals;
  scores: NutrientScore[] | null;
}

export interface MealPlanNutrition {
  hasTargets: boolean;
  /** No (on-grid, non-orphan) entries in the plan. */
  isEmpty: boolean;
  byDay: Record<DayKey, DayScore>;
  weekly: WeeklySummary;
  /** Enrichment status per planned recipe, keyed by recipe id. */
  recipeEnrichment: Record<string, RecipeEnrichment>;
  /** Distinct planned recipes not yet fully enriched (for the "enrich to score" CTA). */
  unenrichedRecipes: RecipeEnrichment[];
}

function enrichmentStatus(enrichedCount: number, totalCount: number): RecipeEnrichmentStatus {
  if (totalCount === 0 || enrichedCount === totalCount) return 'enriched';
  if (enrichedCount === 0) return 'unenriched';
  return 'partial';
}

/**
 * Read + score the whole week. `targets` is the scoring denominator; pass `null`
 * to build the plan totals without scores (no profile). The query key includes the
 * flattened targets so a profile edit re-scores; mutations invalidate the prefix.
 */
export function useMealPlanNutrition(targets: NutritionTargets | null) {
  const flatTarget = targets ? flattenTargets(targets) : null;
  return useQuery({
    queryKey: [...MEAL_PLAN_NUTRITION_KEY, flatTarget] as const,
    queryFn: async (): Promise<MealPlanNutrition> => {
      const db = await dbPromise;
      const entries = await db.getAll('meal_plan_entries');

      // Build per-serving totals + enrichment status for each DISTINCT planned recipe.
      const perServingByRecipeId = new Map<string, NutrientTotals>();
      const recipeEnrichment: Record<string, RecipeEnrichment> = {};
      const distinctRecipeIds = [...new Set(entries.map((entry) => entry.recipe_id))];
      for (const recipeId of distinctRecipeIds) {
        const source = await readRecipeRollupSource(db, recipeId);
        if (!source) continue; // orphan entry (recipe deleted) — skipped
        const recipe = await db.get('recipes', recipeId);
        const rollup = computeNutritionRollup(toRollupIngredients(source.ingredients), source.servings);
        perServingByRecipeId.set(recipeId, rollup.perServing);
        recipeEnrichment[recipeId] = {
          recipeId,
          title: recipe?.title ?? '',
          enrichedCount: rollup.enrichedCount,
          totalCount: rollup.totalCount,
          status: enrichmentStatus(rollup.enrichedCount, rollup.totalCount),
        };
      }

      // Group on-grid, non-orphan entries by day.
      const entriesByDay = emptyByDay<typeof entries>(() => []);
      let entryCount = 0;
      for (const entry of entries) {
        if (!isDayKey(entry.day) || !recipeEnrichment[entry.recipe_id]) continue;
        entriesByDay[entry.day].push(entry);
        entryCount += 1;
      }

      const byDay = emptyByDay<DayScore>(() => ({
        totals: emptyTotals(),
        scores: null,
        entryCount: 0,
      }));
      const dayTotalsList: NutrientTotals[] = [];
      for (const day of DAY_KEYS) {
        const totals = sumDayTotals(entriesByDay[day], perServingByRecipeId);
        dayTotalsList.push(totals);
        byDay[day] = {
          totals,
          scores: flatTarget ? scoreTotals(totals, flatTarget) : null,
          entryCount: entriesByDay[day].length,
        };
      }

      const weeklyTotals = weeklyAveragePerDay(dayTotalsList);
      const weekly: WeeklySummary = {
        totals: weeklyTotals,
        scores: flatTarget ? scoreTotals(weeklyTotals, flatTarget) : null,
      };

      const unenrichedRecipes = Object.values(recipeEnrichment).filter(
        (recipe) => recipe.status !== 'enriched',
      );

      return {
        hasTargets: flatTarget !== null,
        isEmpty: entryCount === 0,
        byDay,
        weekly,
        recipeEnrichment,
        unenrichedRecipes,
      };
    },
  });
}
