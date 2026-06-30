import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EatProfile } from '@/db/schema';
import type { RecipeSummary } from '@/hooks/useRecipes';
import type { WeeklyMealPlan, PlannedRecipe } from '@/hooks/useMealPlan';
import type { MealPlanNutrition } from '@/hooks/useMealPlanNutrition';
import { emptyByDay } from '@/services/mealPlanDays';
import { emptyTotals } from '@/services/nutritionRollup';
import { scoreTotals, flattenTargets } from '@/services/mealPlanScore';
import { computeTargets } from '@/services/nutritionTargets';

vi.mock('@/hooks/useEatProfile', () => ({ useEatProfile: vi.fn() }));
vi.mock('@/hooks/useRecipes', () => ({ useRecipes: vi.fn() }));
vi.mock('@/hooks/useMealPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useMealPlan')>();
  return {
    ...actual,
    useMealPlan: vi.fn(),
    useAddToPlan: () => ({ mutate: vi.fn() }),
    useUpdatePlanServings: () => ({ mutate: vi.fn() }),
    useRemoveFromPlan: () => ({ mutate: vi.fn() }),
  };
});
vi.mock('@/hooks/useMealPlanNutrition', () => ({ useMealPlanNutrition: vi.fn() }));

const PROFILE: EatProfile = {
  age: 30,
  sex: 'female',
  weightKg: 65,
  heightCm: 165,
  activity: 'moderate',
  units: 'metric',
  updated_at: 0,
};

const RECIPE: RecipeSummary = {
  id: 'r1',
  title: 'Veggie Bowl',
  servings: 2,
  created_at: 0,
  ingredientCount: 3,
};

function emptyPlan(): WeeklyMealPlan {
  return { byDay: emptyByDay<PlannedRecipe[]>(() => []), entryCount: 0 };
}

function emptyNutrition(hasTargets: boolean): MealPlanNutrition {
  return {
    hasTargets,
    isEmpty: true,
    byDay: emptyByDay(() => ({ totals: emptyTotals(), scores: null, entryCount: 0 })),
    weekly: { totals: emptyTotals(), scores: null },
    recipeEnrichment: {},
    unenrichedRecipes: [],
  };
}

async function setup(opts: {
  profile: EatProfile | null;
  recipes: RecipeSummary[];
  plan: WeeklyMealPlan;
  nutrition: MealPlanNutrition;
}) {
  const { useEatProfile } = await import('@/hooks/useEatProfile');
  vi.mocked(useEatProfile).mockReturnValue({ data: opts.profile } as ReturnType<typeof useEatProfile>);
  const { useRecipes } = await import('@/hooks/useRecipes');
  vi.mocked(useRecipes).mockReturnValue({ data: opts.recipes } as ReturnType<typeof useRecipes>);
  const { useMealPlan } = await import('@/hooks/useMealPlan');
  vi.mocked(useMealPlan).mockReturnValue({ data: opts.plan } as ReturnType<typeof useMealPlan>);
  const { useMealPlanNutrition } = await import('@/hooks/useMealPlanNutrition');
  vi.mocked(useMealPlanNutrition).mockReturnValue({ data: opts.nutrition } as ReturnType<
    typeof useMealPlanNutrition
  >);
  const { default: WeeklyPlan } = await import('@/components/organisms/WeeklyPlan');
  return render(
    <MemoryRouter>
      <WeeklyPlan />
    </MemoryRouter>,
  );
}

describe('WeeklyPlan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the no-recipes empty state when nothing is saved', async () => {
    await setup({
      profile: PROFILE,
      recipes: [],
      plan: emptyPlan(),
      nutrition: emptyNutrition(true),
    });
    expect(screen.getByText(/save a recipe first/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create a recipe/i })).toBeInTheDocument();
    // No day grid yet.
    expect(screen.queryByRole('heading', { name: 'Monday' })).not.toBeInTheDocument();
  });

  it('renders the 7-day grid once recipes exist; an empty plan shows no score rings', async () => {
    await setup({
      profile: PROFILE,
      recipes: [RECIPE],
      plan: emptyPlan(),
      nutrition: emptyNutrition(true),
    });
    expect(screen.getByRole('heading', { name: 'Monday' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sunday' })).toBeInTheDocument();
    // Empty plan → no weekly summary, no all-zero "under" rings.
    expect(screen.queryByText(/typical day this week/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Energy:/ })).not.toBeInTheDocument();
  });

  it('prompts to set up a profile when there is none, but still builds the grid', async () => {
    await setup({
      profile: null,
      recipes: [RECIPE],
      plan: emptyPlan(),
      nutrition: emptyNutrition(false),
    });
    expect(screen.getByText(/set up your profile above to score/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Monday' })).toBeInTheDocument();
  });

  it('shows the weekly summary and day rings when the plan is scored', async () => {
    const targets = computeTargets(PROFILE);
    const flat = flattenTargets(targets);
    const dayTotals = { ...emptyTotals(), energyKcal: 1800, protein: 90 };
    const planned: PlannedRecipe = {
      entry: { id: 'e1', recipe_id: 'r1', day: 'mon', planned_servings: 2 },
      recipe: { id: 'r1', title: 'Veggie Bowl', servings: 2, created_at: 0 },
    };
    const plan: WeeklyMealPlan = {
      byDay: { ...emptyByDay<PlannedRecipe[]>(() => []), mon: [planned] },
      entryCount: 1,
    };
    const nutrition: MealPlanNutrition = {
      hasTargets: true,
      isEmpty: false,
      byDay: {
        ...emptyByDay(() => ({ totals: emptyTotals(), scores: null, entryCount: 0 })),
        mon: { totals: dayTotals, scores: scoreTotals(dayTotals, flat), entryCount: 1 },
      },
      weekly: { totals: dayTotals, scores: scoreTotals(dayTotals, flat) },
      recipeEnrichment: {
        r1: { recipeId: 'r1', title: 'Veggie Bowl', enrichedCount: 3, totalCount: 3, status: 'enriched' },
      },
      unenrichedRecipes: [],
    };
    await setup({ profile: PROFILE, recipes: [RECIPE], plan, nutrition });

    expect(screen.getByText(/typical day this week/i)).toBeInTheDocument();
    // At least one Energy ring rendered (weekly summary + Monday day score).
    expect(screen.getAllByRole('img', { name: /^Energy:/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('Veggie Bowl')).toBeInTheDocument();
  });
});
