import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RecipeNutritionData } from '@/hooks/useNutrition';
import type { NutrientTotals } from '@/services/nutritionRollup';
import type { RecipeIngredient } from '@/db/schema';

vi.mock('@/hooks/useNutrition', () => ({
  useRecipeNutrition: vi.fn(),
  useEnrichRecipe: vi.fn(),
  usePickFood: vi.fn(),
  useSetIngredientGrams: vi.fn(),
  useFoodCandidates: vi.fn(),
}));

const mockEnrich = vi.fn();
const mockSetGrams = vi.fn();

function ingredient(partial: Partial<RecipeIngredient>): RecipeIngredient {
  return {
    id: 'i1',
    recipe_id: 'r1',
    raw: '1 cup onion',
    canonical_name: 'onion',
    quantity: 1,
    unit: 'cup',
    ...partial,
  };
}

function totals(over: Partial<NutrientTotals> = {}): NutrientTotals {
  return {
    energyKcal: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    fiber: 0,
    sodium: 0,
    calcium: 0,
    iron: 0,
    potassium: 0,
    vitaminC: 0,
    vitaminD: 0,
    ...over,
  };
}

async function setup(options: {
  data?: RecipeNutritionData | null;
  isPending?: boolean;
  enrichData?: { enriched: number; unmatched: string[]; offline: boolean };
  enrichPending?: boolean;
}) {
  const { useRecipeNutrition, useEnrichRecipe, usePickFood, useSetIngredientGrams, useFoodCandidates } =
    await import('@/hooks/useNutrition');

  vi.mocked(useRecipeNutrition).mockReturnValue({
    data: options.data,
    isPending: options.isPending ?? false,
  } as unknown as ReturnType<typeof useRecipeNutrition>);

  vi.mocked(useEnrichRecipe).mockReturnValue({
    mutate: mockEnrich,
    isPending: options.enrichPending ?? false,
    data: options.enrichData,
  } as unknown as ReturnType<typeof useEnrichRecipe>);

  vi.mocked(usePickFood).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof usePickFood>);
  vi.mocked(useSetIngredientGrams).mockReturnValue({
    mutate: mockSetGrams,
    isPending: false,
  } as unknown as ReturnType<typeof useSetIngredientGrams>);
  vi.mocked(useFoodCandidates).mockReturnValue({
    data: [],
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useFoodCandidates>);

  const { default: RecipeNutrition } = await import('@/components/organisms/RecipeNutrition');
  render(<RecipeNutrition recipeId="r1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RecipeNutrition', () => {
  it('shows a loading state while the rollup is pending', async () => {
    await setup({ isPending: true });
    expect(screen.getByText('Loading nutrition…')).toBeInTheDocument();
  });

  it('renders the per-serving panel and toggles to the whole recipe', async () => {
    await setup({
      data: {
        servings: 2,
        rows: [
          {
            ingredient: ingredient({ fdc_id: '1', grams: 100 }),
            name: 'Onion',
            panel: undefined,
            matchedDescription: 'Onions, raw',
            status: 'enriched',
          },
        ],
        rollup: {
          whole: totals({ energyKcal: 200 }),
          perServing: totals({ energyKcal: 100 }),
          enrichedCount: 1,
          totalCount: 1,
          unresolved: [],
        },
      },
    });

    // Per-serving energy shown by default.
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('1 of 1 matched')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Whole recipe' }));
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('offers an Enrich action for unmatched rows and fires the mutation', async () => {
    await setup({
      data: {
        servings: 1,
        rows: [
          {
            ingredient: ingredient({}),
            name: 'Onion',
            status: 'unmatched',
          },
        ],
        rollup: {
          whole: totals(),
          perServing: totals(),
          enrichedCount: 0,
          totalCount: 1,
          unresolved: ['Onion'],
        },
      },
    });

    expect(screen.getByText(/Match this recipe’s ingredients/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Match ingredients' }));
    expect(mockEnrich).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r1' }),
    );
  });

  it('surfaces the offline state after an enrich that could not connect', async () => {
    await setup({
      data: {
        servings: 1,
        rows: [{ ingredient: ingredient({}), name: 'Onion', status: 'unmatched' }],
        rollup: {
          whole: totals(),
          perServing: totals(),
          enrichedCount: 0,
          totalCount: 1,
          unresolved: ['Onion'],
        },
      },
      enrichData: { enriched: 0, unmatched: [], offline: true },
    });

    expect(screen.getByText(/Couldn’t connect to enrich/)).toBeInTheDocument();
    expect(screen.getByText('Needs a connection to match.')).toBeInTheDocument();
  });

  it('badges an estimated row and lets the user adjust it via the portion picker', async () => {
    await setup({
      data: {
        servings: 1,
        rows: [
          {
            ingredient: ingredient({ fdc_id: '1', grams: 150, unit: 'bunch', canonical_name: 'cilantro' }),
            name: 'Cilantro',
            panel: {
              fdc_id: '1',
              description: 'Cilantro, raw',
              per100g: totals(),
              foodPortions: [{ unit: 'cup', gramWeight: 16, amount: 1 }],
            },
            matchedDescription: 'Cilantro, raw',
            status: 'enriched',
            gramsSource: 'estimate',
          },
        ],
        rollup: {
          whole: totals({ energyKcal: 10 }),
          perServing: totals({ energyKcal: 10 }),
          enrichedCount: 1,
          totalCount: 1,
          unresolved: [],
        },
      },
    });

    expect(screen.getByText('≈ est.')).toBeInTheDocument();
    // The picker is collapsed until the user chooses to adjust.
    expect(screen.queryByRole('button', { name: 'Use' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /estimated weight · adjust/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(mockSetGrams).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: 'r1', ingredientId: 'i1', grams: 16 }),
      expect.anything(),
    );
  });

  it('sizes a matched-no-grams row from a portion pick', async () => {
    await setup({
      data: {
        servings: 1,
        rows: [
          {
            ingredient: ingredient({ fdc_id: '1', unit: 'bunch', quantity: 1, canonical_name: 'cilantro' }),
            name: 'Cilantro',
            panel: {
              fdc_id: '1',
              description: 'Cilantro, raw',
              per100g: totals(),
              foodPortions: [{ unit: 'cup', gramWeight: 16, amount: 1 }],
            },
            matchedDescription: 'Cilantro, raw',
            status: 'matched-no-grams',
          },
        ],
        rollup: {
          whole: totals(),
          perServing: totals(),
          enrichedCount: 0,
          totalCount: 1,
          unresolved: ['Cilantro'],
        },
      },
    });

    expect(screen.getByText(/How much is 1 bunch/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(mockSetGrams).toHaveBeenCalledWith(
      expect.objectContaining({ ingredientId: 'i1', grams: 16 }),
      expect.anything(),
    );
  });

  it('falls back to a grams entry when the matched food has no portions', async () => {
    await setup({
      data: {
        servings: 1,
        rows: [
          {
            ingredient: ingredient({ fdc_id: '1', unit: 'knob', quantity: 1, canonical_name: 'butter' }),
            name: 'Butter',
            panel: {
              fdc_id: '1',
              description: 'Butter, salted',
              per100g: totals(),
            },
            matchedDescription: 'Butter, salted',
            status: 'matched-no-grams',
          },
        ],
        rollup: {
          whole: totals(),
          perServing: totals(),
          enrichedCount: 0,
          totalCount: 1,
          unresolved: ['Butter'],
        },
      },
    });

    expect(screen.queryByRole('button', { name: 'Use' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Grams'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockSetGrams).toHaveBeenCalledWith(
      expect.objectContaining({ ingredientId: 'i1', grams: 50 }),
      expect.anything(),
    );
  });
});
