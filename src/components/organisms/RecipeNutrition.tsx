/**
 * Recipe nutrition section (Eat tab, Phase 4 — ADR-0027). Owns the enrichment data
 * for a recipe: reads the offline-computed rollup + per-row match status
 * (`useRecipeNutrition`), runs a user-triggered lazy enrich (`useEnrichRecipe`),
 * and offers a manual food re-pick (`useFoodCandidates` + `usePickFood`) and a
 * manual gram entry (`useSetIngredientGrams`) for the rows the matcher/ladder
 * couldn't resolve. Renders the per-serving / whole-recipe panel and an explicit
 * "needs connection" state when enrichment can't reach the network.
 *
 * Mounted by `RecipeDetailRoute` below the ingredient list. Reuses the
 * `NutritionPanel` + `FoodPickerSheet` molecules and the `Button`/`Spinner`/`Badge`
 * atoms; role tokens only, so it themes green under /eat (ADR-0028).
 */

import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleExclamation, faWifi } from '@fortawesome/free-solid-svg-icons';
import Button from '@/components/atoms/Button';
import Badge from '@/components/atoms/Badge';
import Spinner from '@/components/atoms/Spinner';
import NutritionPanel from '@/components/molecules/NutritionPanel';
import FoodPickerSheet from '@/components/molecules/FoodPickerSheet';
import PortionPicker from '@/components/molecules/PortionPicker';
import {
  useRecipeNutrition,
  useEnrichRecipe,
  usePickFood,
  useSetIngredientGrams,
  useFoodCandidates,
} from '@/hooks/useNutrition';
import type { RecipeIngredient } from '@/db/schema';

export interface RecipeNutritionProps {
  recipeId: string;
}

export default function RecipeNutrition({ recipeId }: RecipeNutritionProps) {
  const { data, isPending } = useRecipeNutrition(recipeId);
  const enrich = useEnrichRecipe();
  const pickFood = usePickFood();
  const setGrams = useSetIngredientGrams();

  const [view, setView] = useState<'perServing' | 'whole'>('perServing');
  const [picking, setPicking] = useState<RecipeIngredient | null>(null);
  // The estimate row whose adjust affordance is expanded (matched-no-grams rows
  // always show the picker, so they need no toggle).
  const [adjustId, setAdjustId] = useState<string | null>(null);

  const candidates = useFoodCandidates(picking?.canonical_name, picking !== null);

  if (isPending) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="font-display font-bold text-text text-base">Nutrition</h2>
        <div className="flex items-center gap-2 text-text-muted text-sm">
          <Spinner aria-label="Loading nutrition" />
          <span>Loading nutrition…</span>
        </div>
      </section>
    );
  }

  if (!data || data.rows.length === 0) return null;

  const { rows, rollup } = data;
  const unmatchedCount = rows.filter((row) => row.status === 'unmatched').length;
  const totals = view === 'perServing' ? rollup.perServing : rollup.whole;
  const offline = enrich.data?.offline ?? false;

  function handleEnrich() {
    enrich.mutate({ recipeId, ingredients: rows.map((row) => row.ingredient) });
  }

  function handlePick(fdcId: string) {
    if (!picking) return;
    pickFood.mutate(
      { recipeId, ingredient: picking, fdcId },
      { onSuccess: () => setPicking(null) },
    );
  }

  function saveGrams(ingredientId: string, grams: number) {
    if (!Number.isFinite(grams) || grams <= 0) return;
    setGrams.mutate(
      { recipeId, ingredientId, grams },
      { onSuccess: () => setAdjustId(null) },
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display font-bold text-text text-base">Nutrition</h2>
        <span className="text-text-muted text-xs">
          {rollup.enrichedCount} of {rollup.totalCount} matched
        </span>
      </div>

      {rollup.enrichedCount > 0 ? (
        <>
          <div className="inline-flex self-start rounded-lg bg-surface p-0.5 text-sm">
            <button
              className={`px-3 py-1 rounded-md ${
                view === 'perServing' ? 'bg-card text-text font-semibold shadow-card' : 'text-text-muted'
              }`}
              onClick={() => setView('perServing')}
            >
              Per serving
            </button>
            <button
              className={`px-3 py-1 rounded-md ${
                view === 'whole' ? 'bg-card text-text font-semibold shadow-card' : 'text-text-muted'
              }`}
              onClick={() => setView('whole')}
            >
              Whole recipe
            </button>
          </div>

          <NutritionPanel totals={totals} />

          {rollup.unresolved.length > 0 && (
            <p className="text-text-muted text-xs">
              Estimated from {rollup.enrichedCount} of {rollup.totalCount} ingredients —{' '}
              {rollup.unresolved.length} still need a match or a weight.
            </p>
          )}
        </>
      ) : (
        <p className="text-text-muted text-sm">
          Match this recipe’s ingredients to USDA FoodData Central to see its nutrition.
        </p>
      )}

      {unmatchedCount > 0 && (
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            onClick={handleEnrich}
            disabled={enrich.isPending}
            className="self-start"
          >
            <span className="flex items-center gap-2">
              {enrich.isPending && <Spinner aria-label="Matching" />}
              {enrich.isPending
                ? 'Matching…'
                : rollup.enrichedCount > 0
                  ? `Match remaining ${unmatchedCount}`
                  : 'Match ingredients'}
            </span>
          </Button>
          {offline && (
            <p className="flex items-center gap-2 text-text-muted text-sm">
              <FontAwesomeIcon icon={faWifi} className="text-amber-500" />
              Couldn’t connect to enrich. Connect and try again — already-matched
              ingredients stay available offline.
            </p>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.ingredient.id}
            className="flex flex-col gap-1 px-4 py-3 bg-card rounded-xl shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                {row.status === 'enriched' ? (
                  <FontAwesomeIcon icon={faCircleCheck} className="text-primary shrink-0" />
                ) : (
                  <FontAwesomeIcon icon={faCircleExclamation} className="text-text-muted shrink-0" />
                )}
                <span className="text-text font-medium truncate">{row.name}</span>
                {row.gramsSource === 'estimate' && <Badge variant="muted">≈ est.</Badge>}
              </span>
              {row.status !== 'unmatched' && (
                <Button
                  variant="secondary"
                  onClick={() => setPicking(row.ingredient)}
                  className="shrink-0 text-xs px-2 py-1"
                >
                  Change
                </Button>
              )}
            </div>

            {row.status === 'enriched' && row.matchedDescription && (
              <div className="flex flex-col gap-1 pl-6">
                <span className="text-text-muted text-xs truncate">
                  Matched to {row.matchedDescription}
                </span>
                {row.gramsSource === 'estimate' &&
                  (adjustId === row.ingredient.id ? (
                    <PortionPicker
                      portions={row.panel?.foodPortions ?? []}
                      onPick={(grams) => saveGrams(row.ingredient.id, grams)}
                      isSaving={setGrams.isPending}
                      initialGrams={row.ingredient.grams}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAdjustId(row.ingredient.id)}
                      className="self-start text-text-muted text-xs underline"
                    >
                      ≈ estimated weight · adjust
                    </button>
                  ))}
              </div>
            )}

            {row.status === 'matched-no-grams' && (
              <div className="flex flex-col gap-2 pl-6">
                <span className="text-text-muted text-xs">
                  Matched to {row.matchedDescription}. How much is{' '}
                  {row.ingredient.quantity} {row.ingredient.unit || 'of this'}?
                </span>
                <PortionPicker
                  portions={row.panel?.foodPortions ?? []}
                  onPick={(grams) => saveGrams(row.ingredient.id, grams)}
                  isSaving={setGrams.isPending}
                />
              </div>
            )}

            {row.status === 'unmatched' && (
              <span className="text-text-muted text-xs pl-6">
                {offline ? 'Needs a connection to match.' : 'Not matched yet.'}
              </span>
            )}
          </li>
        ))}
      </ul>

      {picking && (
        <FoodPickerSheet
          ingredientName={picking.canonical_name}
          candidates={candidates.data ?? []}
          isLoading={candidates.isLoading}
          isError={candidates.isError}
          selectedFdcId={picking.fdc_id}
          isPicking={pickFood.isPending}
          onPick={handlePick}
          onClose={() => setPicking(null)}
        />
      )}
    </section>
  );
}
