import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PortionPicker from '@/components/molecules/PortionPicker';
import type { FdcPortion } from '@/db/schema';

const PORTIONS: FdcPortion[] = [
  { unit: 'cup', gramWeight: 160, amount: 1 },
  { unit: 'slice', gramWeight: 40, amount: 1 },
];

describe('PortionPicker', () => {
  it('picks the selected portion scaled by the stepper', () => {
    const onPick = vi.fn();
    render(<PortionPicker portions={PORTIONS} onPick={onPick} />);

    // Default selection is the first portion (160 g); bump the stepper to 2.
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByText('= 320 g')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(onPick).toHaveBeenCalledWith(320);
  });

  it('lets the user choose a different portion chip', () => {
    const onPick = vi.fn();
    render(<PortionPicker portions={PORTIONS} onPick={onPick} />);

    fireEvent.click(screen.getByRole('button', { name: /1 slice — 40 g/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(onPick).toHaveBeenCalledWith(40);
  });

  it('falls back to a raw grams entry via "Enter grams instead"', () => {
    const onPick = vi.fn();
    render(<PortionPicker portions={PORTIONS} onPick={onPick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Enter grams instead' }));
    fireEvent.change(screen.getByLabelText('Grams'), { target: { value: '73' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onPick).toHaveBeenCalledWith(73);
  });

  it('shows the grams entry directly when the food has no portions', () => {
    const onPick = vi.fn();
    render(<PortionPicker portions={[]} onPick={onPick} />);

    expect(screen.queryByRole('button', { name: 'Use' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Grams'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onPick).toHaveBeenCalledWith(50);
  });

  it('disables Save for a non-positive grams value', () => {
    const onPick = vi.fn();
    render(<PortionPicker portions={[]} onPick={onPick} initialGrams={0} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
