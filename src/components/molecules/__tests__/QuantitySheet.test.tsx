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

  it('renders unit suggestions and wires the input to the datalist', () => {
    render(
      <QuantitySheet
        quantity={1}
        unit=""
        onSave={vi.fn()}
        onClose={vi.fn()}
        unitSuggestions={['cup', 'gram']}
      />,
    );

    const input = screen.getByLabelText('Unit');
    const listId = input.getAttribute('list');
    expect(listId).toBeTruthy();

    const datalist = document.getElementById(listId!);
    expect(datalist?.tagName).toBe('DATALIST');
    const values = Array.from(datalist!.querySelectorAll('option')).map((o) => o.value);
    expect(values).toEqual(['cup', 'gram']);
  });

  it('omits the datalist wiring when no suggestions are given', () => {
    render(<QuantitySheet quantity={1} unit="" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByLabelText('Unit')).not.toHaveAttribute('list');
  });
});
