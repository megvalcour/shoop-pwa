import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ScorePanel from '@/components/molecules/ScorePanel';
import { scoreTotals, flattenTargets } from '@/services/mealPlanScore';
import { emptyTotals } from '@/services/nutritionRollup';
import type { NutritionTargets } from '@/services/nutritionTargets';

const TARGETS: NutritionTargets = {
  energyKcal: 2000,
  protein: { grams: 100 },
  fat: { grams: 60 },
  carbs: { grams: 250 },
  micros: [
    { key: 'fiber', label: 'Fiber', amount: 30, unit: 'g' },
    { key: 'sodium', label: 'Sodium', amount: 2300, unit: 'mg' },
    { key: 'calcium', label: 'Calcium', amount: 1000, unit: 'mg' },
    { key: 'iron', label: 'Iron', amount: 8, unit: 'mg' },
    { key: 'potassium', label: 'Potassium', amount: 3400, unit: 'mg' },
    { key: 'vitaminC', label: 'Vitamin C', amount: 90, unit: 'mg' },
    { key: 'vitaminD', label: 'Vitamin D', amount: 15, unit: 'mcg' },
  ],
};

const scores = scoreTotals(
  { ...emptyTotals(), energyKcal: 1000, protein: 50 },
  flattenTargets(TARGETS),
);

describe('ScorePanel', () => {
  it('full variant renders energy, macros, and micros rings', () => {
    render(<ScorePanel scores={scores} />);
    expect(screen.getByRole('img', { name: /^Energy:/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Protein:/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Vitamin D:/ })).toBeInTheDocument();
    expect(screen.getByText('Micronutrients')).toBeInTheDocument();
  });

  it('compact variant renders only energy + the three macros', () => {
    render(<ScorePanel scores={scores} variant="compact" />);
    expect(screen.getByRole('img', { name: /^Energy:/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Protein:/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Carbs:/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Fat:/ })).toBeInTheDocument();
    // No micros in compact.
    expect(screen.queryByRole('img', { name: /^Vitamin D:/ })).not.toBeInTheDocument();
  });
});
