import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DayColumn from '@/components/molecules/DayColumn';
import type { PlannedRecipe } from '@/hooks/useMealPlan';
import type { DayScore } from '@/hooks/useMealPlanNutrition';
import { scoreTotals, flattenTargets } from '@/services/mealPlanScore';
import { emptyTotals } from '@/services/nutritionRollup';
import type { NutritionTargets } from '@/services/nutritionTargets';

const TARGETS: NutritionTargets = {
  energyKcal: 2000,
  protein: { grams: 100 },
  fat: { grams: 60 },
  carbs: { grams: 250 },
  micros: [],
};

function planned(id: string, recipeId: string, title: string, servings: number): PlannedRecipe {
  return {
    entry: { id, recipe_id: recipeId, day: 'mon', planned_servings: servings },
    recipe: { id: recipeId, title, servings, created_at: 0 },
  };
}

const SCORE: DayScore = {
  totals: { ...emptyTotals(), energyKcal: 1000 },
  scores: scoreTotals({ ...emptyTotals(), energyKcal: 1000 }, flattenTargets(TARGETS)),
  entryCount: 1,
};

function noop() {}

describe('DayColumn', () => {
  it('shows the empty state when no recipes are planned', () => {
    render(
      <DayColumn
        label="Monday"
        planned={[]}
        score={null}
        enrichmentByRecipe={{}}
        onAddRecipe={noop}
        onChangeServings={noop}
        onRemove={noop}
        onEnrich={noop}
        onViewDay={noop}
      />,
    );
    expect(screen.getByText(/nothing planned/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a recipe to monday/i })).toBeInTheDocument();
  });

  it('fires onViewDay when the day heading is tapped', () => {
    const onViewDay = vi.fn();
    render(
      <DayColumn
        label="Monday"
        planned={[]}
        score={null}
        enrichmentByRecipe={{}}
        onAddRecipe={noop}
        onChangeServings={noop}
        onRemove={noop}
        onEnrich={noop}
        onViewDay={onViewDay}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /view monday details/i }));
    expect(onViewDay).toHaveBeenCalled();
  });

  it('renders placed recipes with a compact score and fires servings/remove callbacks', () => {
    const onChangeServings = vi.fn();
    const onRemove = vi.fn();
    render(
      <DayColumn
        label="Monday"
        planned={[planned('e1', 'r1', 'Chili', 2)]}
        score={SCORE}
        enrichmentByRecipe={{ r1: { recipeId: 'r1', title: 'Chili', enrichedCount: 3, totalCount: 3, status: 'enriched' } }}
        onAddRecipe={noop}
        onChangeServings={onChangeServings}
        onRemove={onRemove}
        onEnrich={noop}
        onViewDay={noop}
      />,
    );
    expect(screen.getByText('Chili')).toBeInTheDocument();
    // Compact score ring present.
    expect(screen.getByRole('img', { name: /^Energy:/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /increase servings for chili/i }));
    expect(onChangeServings).toHaveBeenCalledWith('e1', 3);
    fireEvent.click(screen.getByRole('button', { name: /decrease servings for chili/i }));
    expect(onChangeServings).toHaveBeenCalledWith('e1', 1);
    fireEvent.click(screen.getByRole('button', { name: /remove chili from monday/i }));
    expect(onRemove).toHaveBeenCalledWith('e1');
  });

  it('offers "enrich to score" for an unenriched placed recipe', () => {
    const onEnrich = vi.fn();
    render(
      <DayColumn
        label="Monday"
        planned={[planned('e1', 'r1', 'Mystery', 1)]}
        score={SCORE}
        enrichmentByRecipe={{ r1: { recipeId: 'r1', title: 'Mystery', enrichedCount: 0, totalCount: 2, status: 'unenriched' } }}
        onAddRecipe={noop}
        onChangeServings={noop}
        onRemove={noop}
        onEnrich={onEnrich}
        onViewDay={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /enrich to score/i }));
    expect(onEnrich).toHaveBeenCalledWith('r1');
  });
});
