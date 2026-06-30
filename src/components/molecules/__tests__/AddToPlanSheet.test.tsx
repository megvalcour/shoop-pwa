import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import AddToPlanSheet from '@/components/molecules/AddToPlanSheet';
import type { RecipeSummary } from '@/hooks/useRecipes';

const RECIPES: RecipeSummary[] = [
  { id: 'r1', title: 'Chili', servings: 4, created_at: 0, ingredientCount: 5 },
  { id: 'r2', title: 'Salad', servings: 2, created_at: 0, ingredientCount: 3 },
];

function noop() {}

describe('AddToPlanSheet', () => {
  it('picks a recipe, defaults servings to its yield, and adds with the chosen count', () => {
    const onAdd = vi.fn();
    render(<AddToPlanSheet dayLabel="Monday" recipes={RECIPES} onAdd={onAdd} onClose={noop} />);

    fireEvent.click(screen.getByText('Chili'));
    // Default planned servings = the recipe's yield (4).
    expect(screen.getByText('4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /increase planned servings/i }));
    fireEvent.click(screen.getByRole('button', { name: /add to monday/i }));
    expect(onAdd).toHaveBeenCalledWith('r1', 5);
  });

  it('can step back to the recipe list after selecting', () => {
    render(<AddToPlanSheet dayLabel="Monday" recipes={RECIPES} onAdd={noop} onClose={noop} />);
    fireEvent.click(screen.getByText('Salad'));
    expect(screen.getByRole('button', { name: /add to monday/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }));
    // Back to the list — both recipes selectable again.
    expect(screen.getByText('Chili')).toBeInTheDocument();
    expect(screen.getByText('Salad')).toBeInTheDocument();
  });

  it('shows an empty state when there are no recipes', () => {
    render(<AddToPlanSheet dayLabel="Monday" recipes={[]} onAdd={noop} onClose={noop} />);
    expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
  });
});
