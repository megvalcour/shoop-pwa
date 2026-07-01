/**
 * Nutrition enrichment data layer (Eat tab, Phase 4 — ADR-0004/0026/0027). Turns
 * a recipe's ingredient lines into real FDC-backed nutrition: matching, gram
 * conversion, caching, and the per-serving / whole-recipe rollup. All persistent
 * reads/writes go through these TanStack Query hooks backed by IndexedDB; query
 * keys + caching live here only.
 *
 * Offline posture (ADR-0001/0027): the READ hook (`useRecipeNutrition`) computes
 * everything from already-persisted data, so an enriched recipe scores with no
 * network. Only the ENRICH path (`useEnrichRecipe`, `usePickFood`) needs the
 * `/api/nutrition` proxy; a network miss is an explicit unenriched state, never a
 * throw. Persisting `fdc_id`/`grams` back onto each `recipe_ingredient` makes a
 * recipe permanently offline-capable after one enrichment.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dbPromise } from '@/db/idbClient';
import type { FdcNutrientPanel, GramsSource, RecipeIngredient } from '@/db/schema';
import { toGrams, overrideKey } from '@/utils/toGrams';
import {
  readPortionOverrides,
  writePortionOverride,
  PORTION_OVERRIDES_QUERY_KEY,
  type PortionOverrides,
} from '@/hooks/usePortionOverrides';
import { computeNutritionRollup, type NutritionRollup } from '@/services/nutritionRollup';
import {
  displayName,
  readRecipeRollupSource,
  toRollupIngredients,
} from '@/db/recipeNutritionRead';
import { rerankCandidates } from '@/services/fdcMatcher';
import { selectBestCandidate } from '@/services/fdcRerank';

const TOKEN_HEADER = 'X-Shoop-Nutrition';

const NUTRITION_KEY = ['recipe-nutrition'] as const;
const recipeNutritionKey = (recipeId: string) => [...NUTRITION_KEY, recipeId] as const;
// Mirrors the recipe-detail key in useRecipes so an enrich refreshes the row UI.
const recipeDetailKey = (recipeId: string) => ['recipes', recipeId] as const;

/** Trimmed FDC search candidate (mirrors the function's `search` 200 shape). */
export interface FdcCandidate {
  fdcId: string;
  description: string;
  dataType: string;
}

export type NutritionErrorCode =
  | 'invalid_query'
  | 'not_configured'
  | 'unauthorized'
  | 'no_match'
  | 'fetch_failed'
  | 'offline'
  | 'unknown';

export class NutritionApiError extends Error {
  readonly code: NutritionErrorCode;
  readonly status?: number;
  constructor(code: NutritionErrorCode, status?: number) {
    super(`Nutrition request failed: ${code}`);
    this.name = 'NutritionApiError';
    this.code = code;
    this.status = status;
  }
}

const ENDPOINT_CODES: readonly NutritionErrorCode[] = [
  'invalid_query',
  'not_configured',
  'unauthorized',
  'no_match',
  'fetch_failed',
];

async function readErrorCode(response: Response): Promise<NutritionErrorCode> {
  let bodyCode: string | undefined;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === 'string') bodyCode = body.error;
  } catch {
    // non-JSON body — fall through to status mapping
  }
  if (bodyCode && (ENDPOINT_CODES as readonly string[]).includes(bodyCode)) {
    return bodyCode as NutritionErrorCode;
  }
  switch (response.status) {
    case 400:
      return 'invalid_query';
    case 401:
      return 'unauthorized';
    case 422:
      return 'no_match';
    case 502:
      return 'fetch_failed';
    default:
      return 'unknown';
  }
}

function token(): string {
  return import.meta.env.VITE_NUTRITION_TOKEN ?? '';
}

/**
 * Search FDC for an ingredient phrase. Returns candidates; an empty list for a
 * `no_match` (422). Throws {@link NutritionApiError} with code `offline` on a
 * network failure so the caller can stop the run and surface "needs connection".
 */
async function searchFdc(query: string): Promise<FdcCandidate[]> {
  let response: Response;
  try {
    response = await fetch(`/api/nutrition?op=search&q=${encodeURIComponent(query)}`, {
      headers: { [TOKEN_HEADER]: token() },
    });
  } catch {
    throw new NutritionApiError('offline');
  }
  if (response.status === 422) return [];
  if (!response.ok) throw new NutritionApiError(await readErrorCode(response), response.status);
  const data = (await response.json()) as { candidates?: unknown };
  if (!Array.isArray(data.candidates)) return [];
  return data.candidates.filter(
    (c): c is FdcCandidate =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as FdcCandidate).fdcId === 'string' &&
      typeof (c as FdcCandidate).description === 'string',
  );
}

/** Fetch + parse one FDC food's nutrient panel. Throws on error (incl. `offline`). */
async function detailFdc(fdcId: string): Promise<FdcNutrientPanel> {
  let response: Response;
  try {
    response = await fetch(`/api/nutrition?op=detail&fdcId=${encodeURIComponent(fdcId)}`, {
      headers: { [TOKEN_HEADER]: token() },
    });
  } catch {
    throw new NutritionApiError('offline');
  }
  if (!response.ok) throw new NutritionApiError(await readErrorCode(response), response.status);
  return (await response.json()) as FdcNutrientPanel;
}

/**
 * Persist a matched food: cache its panel (keyed by fdc_id, with the resolving
 * query) and write `fdc_id` + the computed `grams`/`grams_source` back onto the
 * ingredient — both in one transaction so the cache and the row can never diverge.
 * A remembered weight for this ingredient+unit (from `overrides`) sizes the row
 * with no user interaction; a curated coarse default sizes it as an `'estimate'`.
 * `grams` stays undefined only when nothing resolves (the row then prompts input).
 */
async function persistMatch(
  ingredient: RecipeIngredient,
  panel: FdcNutrientPanel,
  overrides: PortionOverrides,
): Promise<void> {
  const db = await dbPromise;
  const result = toGrams({
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    canonical_name: ingredient.canonical_name,
    foodPortions: panel.foodPortions,
    overrideGramsPerUnit: overrides[overrideKey(ingredient.canonical_name, ingredient.unit)],
  });

  const updated: RecipeIngredient = { ...ingredient, fdc_id: panel.fdc_id };
  if (result.grams !== undefined) {
    updated.grams = result.grams;
    updated.grams_source = result.source;
  } else {
    delete updated.grams;
    delete updated.grams_source;
  }

  const tx = db.transaction(['nutrition_cache', 'recipe_ingredients'], 'readwrite');
  tx.objectStore('nutrition_cache').put({
    fdc_id: panel.fdc_id,
    payload: panel,
    query: ingredient.canonical_name,
    fetched_at: Date.now(),
  });
  tx.objectStore('recipe_ingredients').put(updated);
  await tx.done;
}

/** Per-ingredient enrichment status, derived from the persisted row + cache. */
export type IngredientStatus = 'enriched' | 'matched-no-grams' | 'unmatched';

export interface IngredientNutrition {
  ingredient: RecipeIngredient;
  name: string;
  panel?: FdcNutrientPanel;
  /** The matched FDC food description, when matched (shown with a re-pick affordance). */
  matchedDescription?: string;
  status: IngredientStatus;
  /** Which ladder rung sized `grams` — lets the UI badge an `'estimate'` row. */
  gramsSource?: GramsSource;
}

export interface RecipeNutritionData {
  servings: number;
  rows: IngredientNutrition[];
  rollup: NutritionRollup;
}

/**
 * Read + compute a recipe's nutrition entirely from persisted data (offline-safe).
 * Each ingredient's status comes from its stored `fdc_id`/`grams` joined to the
 * `nutrition_cache`; the rollup sums what is resolved and lists the rest.
 */
export function useRecipeNutrition(recipeId: string | undefined) {
  return useQuery({
    queryKey: recipeNutritionKey(recipeId ?? ''),
    enabled: recipeId !== undefined,
    queryFn: async (): Promise<RecipeNutritionData | null> => {
      const db = await dbPromise;
      // Shared join (db/recipeNutritionRead) so a recipe's detail score and its
      // weekly-plan score (Phase 5) are built from the exact same code path.
      const source = await readRecipeRollupSource(db, recipeId!);
      if (!source) return null;

      const rows: IngredientNutrition[] = source.ingredients.map(({ ingredient, name, panel }) => {
        const status: IngredientStatus = !panel
          ? 'unmatched'
          : ingredient.grams === undefined
            ? 'matched-no-grams'
            : 'enriched';
        return {
          ingredient,
          name,
          panel,
          matchedDescription: panel?.description,
          status,
          gramsSource: ingredient.grams_source,
        };
      });

      return {
        servings: source.servings,
        rows,
        rollup: computeNutritionRollup(toRollupIngredients(source.ingredients), source.servings),
      };
    },
  });
}

export interface EnrichSummary {
  enriched: number;
  unmatched: string[];
  /** True when the run stopped on a network failure — surface "needs connection". */
  offline: boolean;
}

interface EnrichInput {
  recipeId: string;
  ingredients: RecipeIngredient[];
}

/**
 * Enrich a recipe's not-yet-matched ingredients (lazy, user-triggered). For each:
 * a `nutrition_cache` query hit short-circuits the network; otherwise search →
 * embedding rerank (best-effort; FDC top hit when the model is unavailable) →
 * detail → cache + persist. Stops on the first network failure and reports it so
 * the UI shows a partial/offline state instead of throwing.
 */
export function useEnrichRecipe() {
  const queryClient = useQueryClient();
  return useMutation<EnrichSummary, Error, EnrichInput>({
    mutationFn: async ({ ingredients }): Promise<EnrichSummary> => {
      const db = await dbPromise;
      // Seed a query→entry map from the cache so repeated ingredients (and a prior
      // enrichment) skip the network.
      const byQuery = new Map<string, FdcNutrientPanel>();
      for (const entry of await db.getAll('nutrition_cache')) {
        if (!byQuery.has(entry.query)) byQuery.set(entry.query, entry.payload);
      }
      // Remembered weights auto-size count/container rows with no user interaction.
      const overrides = await readPortionOverrides(db);

      let enriched = 0;
      const unmatched: string[] = [];
      let offline = false;

      for (const ingredient of ingredients) {
        if (ingredient.fdc_id) continue; // already matched — re-pick is manual
        const query = ingredient.canonical_name.trim();
        const label = displayName(ingredient.canonical_name);
        if (!query) {
          unmatched.push(label);
          continue;
        }

        const cached = byQuery.get(query);
        if (cached) {
          await persistMatch(ingredient, cached, overrides);
          enriched += 1;
          continue;
        }

        let candidates: FdcCandidate[];
        try {
          candidates = await searchFdc(query);
        } catch (error) {
          if (error instanceof NutritionApiError && error.code === 'offline') {
            offline = true;
            break;
          }
          unmatched.push(label);
          continue;
        }
        if (candidates.length === 0) {
          unmatched.push(label);
          continue;
        }

        // Rerank (best-effort): fall back to the FDC top hit when unavailable.
        let chosenId = candidates[0].fdcId;
        const scored = await rerankCandidates(
          query,
          candidates.map((c) => ({ fdcId: c.fdcId, description: c.description })),
        );
        if (scored) {
          const best = selectBestCandidate(scored);
          if (best) chosenId = best.candidate.fdcId;
        }

        let panel: FdcNutrientPanel;
        try {
          panel = await detailFdc(chosenId);
        } catch (error) {
          if (error instanceof NutritionApiError && error.code === 'offline') {
            offline = true;
            break;
          }
          unmatched.push(label);
          continue;
        }

        byQuery.set(query, panel);
        await persistMatch(ingredient, panel, overrides);
        enriched += 1;
      }

      return { enriched, unmatched, offline };
    },
    onSettled: (_data, _error, { recipeId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: recipeNutritionKey(recipeId) }),
        queryClient.invalidateQueries({ queryKey: recipeDetailKey(recipeId) }),
      ]),
  });
}

interface PickFoodInput {
  recipeId: string;
  ingredient: RecipeIngredient;
  fdcId: string;
}

/** Manually pick (or re-pick) the FDC food for one ingredient; cache + persist. */
export function usePickFood() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, PickFoodInput>({
    mutationFn: async ({ ingredient, fdcId }) => {
      const db = await dbPromise;
      const cached = await db.get('nutrition_cache', fdcId);
      const panel = cached ? cached.payload : await detailFdc(fdcId);
      const overrides = await readPortionOverrides(db);
      await persistMatch(ingredient, panel, overrides);
    },
    onSettled: (_data, _error, { recipeId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: recipeNutritionKey(recipeId) }),
        queryClient.invalidateQueries({ queryKey: recipeDetailKey(recipeId) }),
      ]),
  });
}

interface SetGramsInput {
  recipeId: string;
  ingredientId: string;
  grams: number;
}

/**
 * Persist a user-resolved weight for an ingredient — from a portion pick OR a typed
 * grams value; both funnel here as a TOTAL grams for the row's `quantity`. The row
 * is tagged `grams_source: 'override'` (user-supplied, never badged as an estimate),
 * and the per-unit weight is remembered so the same `canonical_name|unit` auto-sizes
 * in every future recipe. `grams` is the total; `writePortionOverride` divides by
 * the ingredient's quantity to store a per-unit value.
 */
export function useSetIngredientGrams() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, SetGramsInput>({
    mutationFn: async ({ ingredientId, grams }) => {
      const db = await dbPromise;
      const ingredient = await db.get('recipe_ingredients', ingredientId);
      if (!ingredient) throw new Error(`Ingredient not found: ${ingredientId}`);
      await db.put('recipe_ingredients', { ...ingredient, grams, grams_source: 'override' });
      await writePortionOverride(db, {
        canonical_name: ingredient.canonical_name,
        unit: ingredient.unit,
        grams,
        quantity: ingredient.quantity,
      });
    },
    onSettled: (_data, _error, { recipeId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: recipeNutritionKey(recipeId) }),
        queryClient.invalidateQueries({ queryKey: recipeDetailKey(recipeId) }),
        queryClient.invalidateQueries({ queryKey: PORTION_OVERRIDES_QUERY_KEY }),
      ]),
  });
}

/** On-demand FDC candidate search for the manual food picker. Disabled until opened. */
export function useFoodCandidates(query: string | undefined, enabled: boolean) {
  return useQuery<FdcCandidate[], NutritionApiError>({
    queryKey: ['fdc-search', query],
    enabled: enabled && !!query && query.trim().length > 0,
    queryFn: () => searchFdc((query as string).trim()),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
