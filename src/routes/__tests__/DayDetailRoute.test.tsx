import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EatProfile } from '@/db/schema';
import type { WeeklyMealPlan, PlannedRecipe } from '@/hooks/useMealPlan';
import type { MealPlanNutrition } from '@/hooks/useMealPlanNutrition';
import { emptyByDay } from '@/services/mealPlanDays';
import { emptyTotals } from '@/services/nutritionRollup';
import { scoreTotals, flattenTargets } from '@/services/mealPlanScore';
import { computeTargets } from '@/services/nutritionTargets';

vi.mock('@/hooks/useEatProfile', () => ({ useEatProfile: vi.fn() }));
vi.mock('@/hooks/useMealPlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useMealPlan')>();
  return { ...actual, useMealPlan: vi.fn() };
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

async function renderAt(
  path: string,
  opts: { profile: EatProfile | null; plan: WeeklyMealPlan; nutrition: MealPlanNutrition },
) {
  const { useEatProfile } = await import('@/hooks/useEatProfile');
  vi.mocked(useEatProfile).mockReturnValue({ data: opts.profile } as ReturnType<typeof useEatProfile>);
  const { useMealPlan } = await import('@/hooks/useMealPlan');
  vi.mocked(useMealPlan).mockReturnValue({ data: opts.plan } as ReturnType<typeof useMealPlan>);
  const { useMealPlanNutrition } = await import('@/hooks/useMealPlanNutrition');
  vi.mocked(useMealPlanNutrition).mockReturnValue({
    data: opts.nutrition,
    isPending: false,
  } as ReturnType<typeof useMealPlanNutrition>);
  const { default: DayDetailRoute } = await import('@/routes/DayDetailRoute');
  const router = createMemoryRouter(
    [
      { path: '/eat/plan/:day', element: <DayDetailRoute /> },
      { path: '/eat', element: <div>Eat landing</div> },
      { path: '/eat/recipes/:id', element: <div>Recipe detail</div> },
    ],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe('DayDetailRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a not-found fallback for an invalid day param', async () => {
    await renderAt('/eat/plan/notaday', {
      profile: PROFILE,
      plan: emptyPlan(),
      nutrition: emptyNutrition(true),
    });
    expect(screen.getByText(/couldn.t be found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to eat/i })).toBeInTheDocument();
  });

  it('shows the empty state for a day with nothing planned', async () => {
    await renderAt('/eat/plan/mon', {
      profile: PROFILE,
      plan: emptyPlan(),
      nutrition: emptyNutrition(true),
    });
    expect(screen.getByRole('heading', { name: 'Monday' })).toBeInTheDocument();
    expect(screen.getByText(/nothing planned for monday/i)).toBeInTheDocument();
    // No all-zero "under" rings for an empty day.
    expect(screen.queryByRole('img', { name: /^Energy:/ })).not.toBeInTheDocument();
  });

  it('shows the full scored panel (including a micro) when the day has recipes and a profile', async () => {
    const targets = computeTargets(PROFILE);
    const flat = flattenTargets(targets);
    const dayTotals = { ...emptyTotals(), energyKcal: 1800, protein: 90, potassium: 2500 };
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
    await renderAt('/eat/plan/mon', { profile: PROFILE, plan, nutrition });

    expect(screen.getByText('Veggie Bowl')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Energy:/ })).toBeInTheDocument();
    // A micro readout shows on the day detail that the compact week card omits.
    expect(screen.getByRole('img', { name: /^Potassium:/ })).toBeInTheDocument();
  });

  it('shows raw totals via NutritionPanel (no rings) when there is no profile', async () => {
    const dayTotals = { ...emptyTotals(), energyKcal: 1800, potassium: 2500 };
    const planned: PlannedRecipe = {
      entry: { id: 'e1', recipe_id: 'r1', day: 'mon', planned_servings: 2 },
      recipe: { id: 'r1', title: 'Veggie Bowl', servings: 2, created_at: 0 },
    };
    const plan: WeeklyMealPlan = {
      byDay: { ...emptyByDay<PlannedRecipe[]>(() => []), mon: [planned] },
      entryCount: 1,
    };
    const nutrition: MealPlanNutrition = {
      hasTargets: false,
      isEmpty: false,
      byDay: {
        ...emptyByDay(() => ({ totals: emptyTotals(), scores: null, entryCount: 0 })),
        mon: { totals: dayTotals, scores: null, entryCount: 1 },
      },
      weekly: { totals: dayTotals, scores: null },
      recipeEnrichment: {
        r1: { recipeId: 'r1', title: 'Veggie Bowl', enrichedCount: 3, totalCount: 3, status: 'enriched' },
      },
      unenrichedRecipes: [],
    };
    await renderAt('/eat/plan/mon', { profile: null, plan, nutrition });

    expect(screen.getByText(/set up your profile to score/i)).toBeInTheDocument();
    expect(screen.getByText('1,800')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Energy:/ })).not.toBeInTheDocument();
  });

  it('offers an "enrich to score" link for a placed, unenriched recipe', async () => {
    const planned: PlannedRecipe = {
      entry: { id: 'e1', recipe_id: 'r1', day: 'mon', planned_servings: 1 },
      recipe: { id: 'r1', title: 'Mystery Soup', servings: 2, created_at: 0 },
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
        mon: { totals: emptyTotals(), scores: scoreTotals(emptyTotals(), flattenTargets(computeTargets(PROFILE))), entryCount: 1 },
      },
      weekly: { totals: emptyTotals(), scores: null },
      recipeEnrichment: {
        r1: { recipeId: 'r1', title: 'Mystery Soup', enrichedCount: 0, totalCount: 2, status: 'unenriched' },
      },
      unenrichedRecipes: [
        { recipeId: 'r1', title: 'Mystery Soup', enrichedCount: 0, totalCount: 2, status: 'unenriched' },
      ],
    };
    await renderAt('/eat/plan/mon', { profile: PROFILE, plan, nutrition });

    expect(screen.getByRole('link', { name: /enrich to score/i })).toBeInTheDocument();
  });
});
