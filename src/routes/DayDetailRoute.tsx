import { Link, useNavigate, useParams } from 'react-router';
import Button from '@/components/atoms/Button';
import NutritionPanel from '@/components/molecules/NutritionPanel';
import ScorePanel from '@/components/molecules/ScorePanel';
import { useMealPlan } from '@/hooks/useMealPlan';
import { useMealPlanNutrition } from '@/hooks/useMealPlanNutrition';
import { useEatProfile } from '@/hooks/useEatProfile';
import { computeTargets } from '@/services/nutritionTargets';
import { DAYS, isDayKey } from '@/services/mealPlanDays';

/**
 * Read-only day detail for the Eat weekly plan (Phase 6). Shows the day's full
 * macro AND micro nutrition — the same panel the weekly "typical day" summary
 * renders, scoped to one day — plus its planned recipes. All editing (servings/
 * add/remove) stays on the week grid; this route only reads already-fetched data
 * (`useMealPlanNutrition` is cached per targets), so it's offline by construction.
 * Renders under `/eat` so it inherits the green sub-theme (ADR-0028).
 */
export default function DayDetailRoute() {
  const { day } = useParams<{ day: string }>();
  const navigate = useNavigate();
  const { data: profile } = useEatProfile();
  const targets = profile ? computeTargets(profile) : null;

  const { data: plan } = useMealPlan();
  const nutrition = useMealPlanNutrition(targets);

  if (!day || !isDayKey(day)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full px-4">
        <span className="text-text-muted">That day couldn’t be found.</span>
        <Button variant="secondary" onClick={() => navigate('/eat')}>
          Back to Eat
        </Button>
      </div>
    );
  }

  if (nutrition.isPending) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-text-muted">Loading…</span>
      </div>
    );
  }

  const dayMeta = DAYS.find((d) => d.key === day)!;
  const planned = plan?.byDay[day] ?? [];
  const dayScore = nutrition.data?.byDay[day] ?? null;
  const enrichmentByRecipe = nutrition.data?.recipeEnrichment ?? {};
  const hasRecipes = planned.length > 0;

  return (
    <div className="flex flex-col gap-6 px-4 py-6 pb-24">
      <header className="flex flex-col gap-1">
        <h1 className="font-display font-extrabold text-ink text-2xl">{dayMeta.label}</h1>
        <span className="text-text-muted text-sm">
          {planned.length} {planned.length === 1 ? 'recipe' : 'recipes'} planned
        </span>
      </header>

      {hasRecipes ? (
        <section className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {planned.map(({ entry, recipe }) => {
              const enrichment = enrichmentByRecipe[recipe.id];
              const needsEnrichment = enrichment !== undefined && enrichment.status !== 'enriched';
              return (
                <li
                  key={entry.id}
                  className="flex flex-col gap-1 px-4 py-3 bg-card rounded-xl shadow-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/eat/recipes/${recipe.id}`}
                      className="text-text text-sm font-medium min-w-0 wrap-break-word"
                    >
                      {recipe.title}
                    </Link>
                    <span className="text-text-muted text-xs shrink-0">
                      {entry.planned_servings} {entry.planned_servings === 1 ? 'serving' : 'servings'}
                    </span>
                  </div>
                  {needsEnrichment && (
                    <Link
                      to={`/eat/recipes/${recipe.id}`}
                      className="self-start text-xs font-medium text-accent underline underline-offset-2"
                    >
                      Enrich to score
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-4 bg-card rounded-xl shadow-card">
          <span className="text-text-muted text-sm">
            Nothing planned for {dayMeta.label}. Add a recipe from the week view.
          </span>
          <Button variant="secondary" onClick={() => navigate('/eat')} className="self-start">
            Back to week view
          </Button>
        </div>
      )}

      {hasRecipes && dayScore && (
        <section className="flex flex-col gap-3">
          {dayScore.scores ? (
            <ScorePanel scores={dayScore.scores} variant="full" />
          ) : (
            <>
              <p className="text-text-muted text-sm">
                Set up your profile to score this day against your daily targets.
              </p>
              <NutritionPanel totals={dayScore.totals} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
