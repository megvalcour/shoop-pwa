import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { EatProfile } from '@/db/schema';

vi.mock('@/hooks/useEatProfile', () => ({
  useEatProfile: vi.fn(),
  useSetEatProfile: vi.fn(),
}));

const mockMutate = vi.fn();

async function setup(profile: EatProfile | null = null) {
  const { useEatProfile, useSetEatProfile } = await import('@/hooks/useEatProfile');
  vi.mocked(useEatProfile).mockReturnValue({ data: profile } as ReturnType<typeof useEatProfile>);
  vi.mocked(useSetEatProfile).mockReturnValue({
    mutate: mockMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useSetEatProfile>);
  const { default: EatProfileForm } = await import('@/components/organisms/EatProfileForm');
  return render(<EatProfileForm />);
}

function fillImperial() {
  fireEvent.change(screen.getByLabelText('Age'), { target: { value: '30' } });
  fireEvent.change(screen.getByLabelText('Weight'), { target: { value: '154' } });
  fireEvent.change(screen.getByLabelText('Height (feet)'), { target: { value: '5' } });
  fireEvent.change(screen.getByLabelText('Height (inches)'), { target: { value: '9' } });
}

describe('EatProfileForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('disables save on an empty (invalid) form', async () => {
    await setup(null);
    expect(screen.getByRole('button', { name: /save profile/i })).toBeDisabled();
  });

  it('enables save once all fields are valid and dirty', async () => {
    await setup(null);
    fillImperial();
    expect(screen.getByRole('button', { name: /save profile/i })).toBeEnabled();
  });

  it('disables save when age is out of range', async () => {
    await setup(null);
    fillImperial();
    fireEvent.change(screen.getByLabelText('Age'), { target: { value: '5' } });
    expect(screen.getByRole('button', { name: /save profile/i })).toBeDisabled();
    expect(screen.getByText(/age must be/i)).toBeInTheDocument();
  });

  it('converts visible values in place when the units toggle flips', async () => {
    await setup(null);
    fillImperial();

    fireEvent.click(screen.getByRole('button', { name: /^metric$/i }));

    // 154 lb → ~69.9 kg; the weight field now shows kg.
    expect(screen.getByLabelText('Weight')).toHaveValue(69.9);
    // 5 ft 9 in → 175.3 cm; a single cm height field replaces ft/in.
    expect(screen.getByLabelText('Height')).toHaveValue(175.3);
    expect(screen.queryByLabelText('Height (feet)')).not.toBeInTheDocument();
  });

  it('submits a canonical METRIC profile from imperial input', async () => {
    await setup(null);
    fillImperial();

    fireEvent.click(screen.getByRole('button', { name: /save profile/i }));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const saved = mockMutate.mock.calls[0][0] as EatProfile;
    expect(saved.age).toBe(30);
    expect(saved.sex).toBe('female');
    expect(saved.activity).toBe('moderate');
    expect(saved.units).toBe('imperial');
    expect(saved.weightKg).toBeCloseTo(69.8532, 3); // 154 lb
    expect(saved.heightCm).toBeCloseTo(175.26, 2); // 5 ft 9 in
  });

  it('seeds from an existing profile in its stored display units', async () => {
    await setup({
      age: 45,
      sex: 'male',
      weightKg: 80,
      heightCm: 180,
      activity: 'active',
      units: 'metric',
      updated_at: 0,
    });

    expect(screen.getByLabelText('Age')).toHaveValue(45);
    expect(screen.getByLabelText('Weight')).toHaveValue(80);
    expect(screen.getByLabelText('Height')).toHaveValue(180);
    // Unchanged form is not dirty → save stays disabled until an edit.
    expect(screen.getByRole('button', { name: /save profile/i })).toBeDisabled();
  });
});
