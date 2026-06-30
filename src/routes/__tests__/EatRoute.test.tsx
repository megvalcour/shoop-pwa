import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EatProfile } from '@/db/schema';

vi.mock('@/hooks/useEatProfile', () => ({
  useEatProfile: vi.fn(),
  useSetEatProfile: vi.fn(),
}));

async function renderRoute(state: Partial<{ data: EatProfile | null; isLoading: boolean }>) {
  const { useEatProfile } = await import('@/hooks/useEatProfile');
  vi.mocked(useEatProfile).mockReturnValue({
    data: state.data ?? null,
    isLoading: state.isLoading ?? false,
  } as ReturnType<typeof useEatProfile>);
  const { default: EatRoute } = await import('@/routes/EatRoute');
  return render(<EatRoute />);
}

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

  it('renders the intro heading and the Recipes/Weekly Plan stubs', async () => {
    await renderRoute({ data: null });
    expect(screen.getByRole('heading', { name: /plan your week/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Profile$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Recipes$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Weekly Plan$/ })).toBeInTheDocument();
    // Only the two later-phase sections remain "coming soon" now.
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(2);
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
