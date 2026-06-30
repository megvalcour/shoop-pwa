import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EatProfile } from '@/db/schema';
import type { RecipeSummary } from '@/hooks/useRecipes';

vi.mock('@/hooks/useEatProfile', () => ({
  useEatProfile: vi.fn(),
  useSetEatProfile: vi.fn(),
}));

vi.mock('@/hooks/useRecipes', () => ({
  useRecipes: vi.fn(),
}));

async function renderRoute(
  state: Partial<{ data: EatProfile | null; isLoading: boolean; recipes: RecipeSummary[] }>,
) {
  const { useEatProfile } = await import('@/hooks/useEatProfile');
  vi.mocked(useEatProfile).mockReturnValue({
    data: state.data ?? null,
    isLoading: state.isLoading ?? false,
  } as ReturnType<typeof useEatProfile>);
  const { useRecipes } = await import('@/hooks/useRecipes');
  vi.mocked(useRecipes).mockReturnValue({
    data: state.recipes ?? [],
    isLoading: false,
  } as ReturnType<typeof useRecipes>);
  const { default: EatRoute } = await import('@/routes/EatRoute');
  return render(
    <MemoryRouter>
      <EatRoute />
    </MemoryRouter>,
  );
}

const RECIPE: RecipeSummary = {
  id: 'r1',
  title: 'Weeknight Chili',
  servings: 6,
  created_at: 0,
  ingredientCount: 4,
};

const PROFILE: EatProfile = {
  age: 30,
  sex: 'female',
  weightKg: 65,
  heightCm: 165,
  activity: 'moderate',
  units: 'metric',
  updated_at: 0,
};

describe('EatRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the intro heading, the Recipes section, and the Weekly Plan stub', async () => {
    await renderRoute({ data: null });
    expect(screen.getByRole('heading', { name: /plan your week/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Profile$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Recipes$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Weekly Plan$/ })).toBeInTheDocument();
    // Only Weekly Plan (Phase 5) remains "coming soon"; Recipes is live now.
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(1);
  });

  it('shows the Recipes empty state when no recipes exist', async () => {
    await renderRoute({ data: null, recipes: [] });
    expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add a recipe/i })).toBeInTheDocument();
  });

  it('lists saved recipes when the library is populated', async () => {
    await renderRoute({ data: null, recipes: [RECIPE] });
    expect(screen.getByRole('button', { name: 'Weeknight Chili' })).toBeInTheDocument();
    expect(screen.getByText(/6 servings · 4 ingredients/i)).toBeInTheDocument();
    expect(screen.queryByText(/no recipes yet/i)).not.toBeInTheDocument();
  });

  it('shows the empty-state CTA when no profile is set', async () => {
    await renderRoute({ data: null });
    expect(screen.getByRole('button', { name: /set up your profile/i })).toBeInTheDocument();
    expect(screen.queryByText(/^Energy$/)).not.toBeInTheDocument();
  });

  it('shows the computed targets and an edit affordance when a profile exists', async () => {
    await renderRoute({ data: PROFILE });
    // Energy + a couple of macro/micro readouts render.
    expect(screen.getByText(/^Energy$/)).toBeInTheDocument();
    expect(screen.getByText(/^Protein$/)).toBeInTheDocument();
    expect(screen.getByText(/^Calcium$/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /set up your profile/i })).not.toBeInTheDocument();
  });
});
