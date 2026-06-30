/**
 * The Weekly Plan section of the Eat tab (Phase 5 — ADR-0026/0028/0029). Owns the
 * plan data (`useMealPlan` + its mutations) and the scoring (`useMealPlanNutrition`,
 * fed the profile→targets compute), renders the fixed Mon–Sun grid of `DayColumn`s,
 * the weekly "typical day" summary, and the add-recipe sheet.
 *
 * Everything reads from already-persisted data, so a scored week works fully
 * offline (ADR-0001); a placed-but-unenriched recipe contributes a partial total
 * and surfaces an "enrich to score" link to its detail, never a throw. Three
 * gating states: no recipes saved (CTA to the library), no profile (plan builds
 * but scoring is withheld with a "set up your profile" hint), and an empty plan
 * (an "add a recipe to a day" prompt, NOT all-zero "under" rings). Role tokens
 * only, so it themes green under /eat (ADR-0028).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { faCalendarWeek } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import Button from '@/components/atoms/Button';
import DayColumn from '@/components/molecules/DayColumn';
import ScorePanel from '@/components/molecules/ScorePanel';
import AddToPlanSheet from '@/components/molecules/AddToPlanSheet';
import {
  useMealPlan,
  useAddToPlan,
  useUpdatePlanServings,
  useRemoveFromPlan,
} from '@/hooks/useMealPlan';
import { useMealPlanNutrition } from '@/hooks/useMealPlanNutrition';
import { useRecipes } from '@/hooks/useRecipes';
import { useEatProfile } from '@/hooks/useEatProfile';
import { computeTargets } from '@/services/nutritionTargets';
import { DAYS, type DayKey } from '@/services/mealPlanDays';

export default function WeeklyPlan() {
  const navigate = useNavigate();
  const { data: profile } = useEatProfile();
  const targets = profile ? computeTargets(profile) : null;

  const { data: plan } = useMealPlan();
  const nutrition = useMealPlanNutrition(targets);
  const { data: recipes } = useRecipes();

  const addToPlan = useAddToPlan();
  const updateServings = useUpdatePlanServings();
  const removeFromPlan = useRemoveFromPlan();

  const [addDay, setAddDay] = useState<DayKey | null>(null);

  const hasRecipes = (recipes?.length ?? 0) > 0;
  const planEmpty = (plan?.entryCount ?? 0) === 0;
  const showScores = !planEmpty && nutrition.data?.hasTargets === true;

  const addDayMeta = addDay ? DAYS.find((day) => day.key === addDay) ?? null : null;

  return (
    <section className="px-4 pt-6">
      <h2 className="font-display font-bold text-text text-lg mb-3">Weekly Plan</h2>

      {!hasRecipes ? (
        <div className="flex flex-col gap-3 px-4 py-4 bg-card rounded-xl shadow-card">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon
              icon={faCalendarWeek}
              className="text-text-muted text-lg mt-0.5 shrink-0"
            />
            <span className="text-text-muted text-sm">
              Save a recipe first, then lay out your week and see how each day stacks up against your
              targets.
            </span>
          </div>
          <Button
            variant="primary"
            onClick={() => navigate('/eat/recipes/new')}
            className="self-start"
          >
            Create a recipe
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {!profile && (
            <p className="px-4 py-3 bg-card rounded-xl shadow-card text-text-muted text-sm">
              Set up your profile above to score this week against your daily targets.
            </p>
          )}

          {showScores && nutrition.data?.weekly.scores && (
            <div className="flex flex-col gap-3 px-4 py-4 bg-card rounded-xl shadow-card">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-display font-bold text-text">Typical day this week</h3>
                <span className="text-text-muted text-xs">
                  Your week’s nutrition averaged across all seven days, vs your daily targets.
                </span>
              </div>
              <ScorePanel scores={nutrition.data.weekly.scores} />
            </div>
          )}

          <div className="grid gap-3">
            {DAYS.map((day) => (
              <DayColumn
                key={day.key}
                label={day.label}
                planned={plan?.byDay[day.key] ?? []}
                score={nutrition.data?.byDay[day.key] ?? null}
                enrichmentByRecipe={nutrition.data?.recipeEnrichment ?? {}}
                onAddRecipe={() => setAddDay(day.key)}
                onChangeServings={(entryId, plannedServings) =>
                  updateServings.mutate({ entryId, plannedServings })
                }
                onRemove={(entryId) => removeFromPlan.mutate(entryId)}
                onEnrich={(recipeId) => navigate(`/eat/recipes/${recipeId}`)}
              />
            ))}
          </div>
        </div>
      )}

      {addDayMeta && (
        <AddToPlanSheet
          dayLabel={addDayMeta.label}
          recipes={recipes ?? []}
          onAdd={(recipeId, plannedServings) => {
            addToPlan.mutate({ recipeId, day: addDayMeta.key, plannedServings });
            setAddDay(null);
          }}
          onClose={() => setAddDay(null)}
        />
      )}
    </section>
  );
}
