import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AislePickerSheet from '@/components/molecules/AislePickerSheet';
import type { Aisle } from '@/db/schema';

const AISLES: Aisle[] = [
  { id: 'a1', store_id: 's1', number: '1', label: 'Dairy & Eggs', sort_order: 1 },
  { id: 'a2', store_id: 's1', number: '21', label: 'Bread & Bakery', sort_order: 21 },
];

describe('AislePickerSheet', () => {
  it('renders all aisle rows', () => {
    render(
      <AislePickerSheet
        aisles={AISLES}
        currentAisleId=""
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Aisle 1 — Dairy & Eggs')).toBeInTheDocument();
    expect(screen.getByText('Aisle 21 — Bread & Bakery')).toBeInTheDocument();
  });

  it('calls onSelect with the correct aisleId when a row is clicked', () => {
    const onSelect = vi.fn();
    render(
      <AislePickerSheet
        aisles={AISLES}
        currentAisleId=""
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Aisle 21 — Bread & Bakery'));
    expect(onSelect).toHaveBeenCalledWith('a2');
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <AislePickerSheet
        aisles={AISLES}
        currentAisleId=""
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    render(
      <AislePickerSheet
        aisles={AISLES}
        currentAisleId=""
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /close aisle picker/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
