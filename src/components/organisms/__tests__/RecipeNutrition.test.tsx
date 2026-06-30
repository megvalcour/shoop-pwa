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
    mutate: vi.fn(),
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
});
