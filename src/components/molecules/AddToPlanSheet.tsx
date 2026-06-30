/**
 * Add-a-recipe-to-a-day picker (Eat tab, Phase 5). A `BottomSheet` + `SelectionList`
 * of saved recipes; picking one reveals a planned-servings stepper (defaulting to
 * the recipe's own yield) before confirming. Reuses the shared `BottomSheet` /
 * `SelectionList` molecules and `Button`/`Icon` atoms (ADR-0005); presentational —
 * the `WeeklyPlan` organism owns the recipe list and the add mutation.
 */

import { useState } from 'react';
import { faMinus, faPlus } from '@fortawesome/free-solid-svg-icons';
import BottomSheet from '@/components/molecules/BottomSheet';
import SelectionList from '@/components/molecules/SelectionList';
import Button from '@/components/atoms/Button';
import Icon from '@/components/atoms/Icon';
import type { RecipeSummary } from '@/hooks/useRecipes';

export interface AddToPlanSheetProps {
  dayLabel: string;
  recipes: RecipeSummary[];
  onAdd: (recipeId: string, plannedServings: number) => void;
  onClose: () => void;
}

export default function AddToPlanSheet({ dayLabel, recipes, onAdd, onClose }: AddToPlanSheetProps) {
  const [selected, setSelected] = useState<RecipeSummary | null>(null);
  const [servings, setServings] = useState(1);

  function pick(recipe: RecipeSummary) {
    setSelected(recipe);
    setServings(Math.max(1, Math.round(recipe.servings)));
  }

  return (
    <BottomSheet title={`Add to ${dayLabel}`} onClose={onClose}>
      {recipes.length === 0 ? (
        <p className="px-4 py-8 text-center text-text-muted text-sm">
          No recipes yet. Save a recipe first, then add it to your week.
        </p>
      ) : selected === null ? (
        <SelectionList
          items={recipes}
          getKey={(recipe) => recipe.id}
          isSelected={() => false}
          onSelect={(recipe) => pick(recipe)}
          renderLabel={(recipe) => (
            <span className="flex flex-col min-w-0">
              <span className="truncate">{recipe.title}</span>
              <span className="text-text-muted text-xs">
                {recipe.servings} {recipe.servings === 1 ? 'serving' : 'servings'}
              </span>
            </span>
          )}
        />
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <span className="text-text font-medium">{selected.title}</span>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Planned servings
            </span>
            <div className="flex items-center justify-center gap-6">
              <Button
                variant="secondary"
                shape="icon"
                onClick={() => setServings((value) => Math.max(1, value - 1))}
                aria-label="Decrease planned servings"
              >
                <Icon icon={faMinus} />
              </Button>
              <span
                className="min-w-8 text-center text-2xl font-semibold text-text"
                aria-live="polite"
              >
                {servings}
              </span>
              <Button
                variant="secondary"
                shape="icon"
                onClick={() => setServings((value) => value + 1)}
                aria-label="Increase planned servings"
              >
                <Icon icon={faPlus} />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Back
            </Button>
            <Button variant="primary" onClick={() => onAdd(selected.id, servings)} className="flex-1">
              Add to {dayLabel}
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
