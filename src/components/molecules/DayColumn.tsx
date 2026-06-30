/**
 * One day of the weekly-plan grid (Eat tab, Phase 5). Shows the day's placed
 * recipes (title + a planned-servings stepper + remove), an "add recipe"
 * affordance, and a compact day score — or a "no recipes" empty state. A
 * placed-but-unenriched recipe gets an inline "enrich to score" link to its detail
 * so a partial score is always actionable, never a dead end.
 *
 * No store access — every change is a callback up to the `WeeklyPlan` organism
 * (ADR-0005). Role tokens only, so it themes green under /eat (ADR-0028).
 */

import { faMinus, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import Button from '@/components/atoms/Button';
import Icon from '@/components/atoms/Icon';
import ScorePanel from '@/components/molecules/ScorePanel';
import type { PlannedRecipe } from '@/hooks/useMealPlan';
import type { DayScore, RecipeEnrichment } from '@/hooks/useMealPlanNutrition';

export interface DayColumnProps {
  label: string;
  planned: PlannedRecipe[];
  /** Null when there is no profile (scoring withheld). */
  score: DayScore | null;
  enrichmentByRecipe: Record<string, RecipeEnrichment>;
  onAddRecipe: () => void;
  onChangeServings: (entryId: string, plannedServings: number) => void;
  onRemove: (entryId: string) => void;
  onEnrich: (recipeId: string) => void;
}

export default function DayColumn({
  label,
  planned,
  score,
  enrichmentByRecipe,
  onAddRecipe,
  onChangeServings,
  onRemove,
  onEnrich,
}: DayColumnProps) {
  const hasRecipes = planned.length > 0;

  return (
    <section className="flex flex-col gap-3 px-4 py-3 bg-card rounded-xl shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display font-bold text-text">{label}</h3>
        <Button
          variant="secondary"
          onClick={onAddRecipe}
          className="shrink-0 text-xs px-2 py-1"
          aria-label={`Add a recipe to ${label}`}
        >
          <span className="flex items-center gap-1.5">
            <Icon icon={faPlus} />
            Add
          </span>
        </Button>
      </div>

      {hasRecipes ? (
        <ul className="flex flex-col gap-2">
          {planned.map(({ entry, recipe }) => {
            const enrichment = enrichmentByRecipe[recipe.id];
            const needsEnrichment = enrichment !== undefined && enrichment.status !== 'enriched';
            return (
              <li key={entry.id} className="flex flex-col gap-1">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-text text-sm font-medium min-w-0 wrap-break-word">
                    {recipe.title}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="secondary"
                      shape="icon"
                      onClick={() => onChangeServings(entry.id, entry.planned_servings - 1)}
                      aria-label={`Decrease servings for ${recipe.title}`}
                    >
                      <Icon icon={faMinus} />
                    </Button>
                    <span
                      className="min-w-6 text-center text-sm font-semibold text-text"
                      aria-label={`${entry.planned_servings} servings`}
                    >
                      {entry.planned_servings}
                    </span>
                    <Button
                      variant="secondary"
                      shape="icon"
                      onClick={() => onChangeServings(entry.id, entry.planned_servings + 1)}
                      aria-label={`Increase servings for ${recipe.title}`}
                    >
                      <Icon icon={faPlus} />
                    </Button>
                    <Button
                      variant="ghost"
                      shape="icon"
                      onClick={() => onRemove(entry.id)}
                      aria-label={`Remove ${recipe.title} from ${label}`}
                    >
                      <Icon icon={faXmark} />
                    </Button>
                  </div>
                </div>
                {needsEnrichment && (
                  <button
                    type="button"
                    onClick={() => onEnrich(recipe.id)}
                    className="self-start text-xs font-medium text-accent underline underline-offset-2"
                  >
                    Enrich to score
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-text-muted text-sm">Nothing planned yet — add a recipe to this day.</p>
      )}

      {hasRecipes && score?.scores && <ScorePanel scores={score.scores} variant="compact" />}
    </section>
  );
}
