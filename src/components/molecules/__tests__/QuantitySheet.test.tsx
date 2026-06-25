import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuantitySheet from '@/components/molecules/QuantitySheet';

describe('QuantitySheet', () => {
  it('increments and decrements the quantity', () => {
    const onSave = vi.fn();
    render(<QuantitySheet quantity={2} unit="" onSave={onSave} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /increase quantity/i }));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(3, '');
  });

  it('clamps the quantity at a minimum of 1', () => {
    const onSave = vi.fn();
    render(<QuantitySheet quantity={1} unit="" onSave={onSave} onClose={vi.fn()} />);

    const decrease = screen.getByRole('button', { name: /decrease quantity/i });
    fireEvent.click(decrease);
    fireEvent.click(decrease);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).toHaveBeenCalledWith(1, '');
  });

  it('edits the unit and saves it trimmed, then closes', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<QuantitySheet quantity={1} unit="" onSave={onSave} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: '  cans  ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith(1, 'cans');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('seeds the stepper and unit input from props', () => {
    render(<QuantitySheet quantity={4} unit="oz" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByLabelText('Unit')).toHaveValue('oz');
  });
});
