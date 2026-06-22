import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import SortableAisleCard from '@/components/molecules/SortableAisleCard';
import type { Aisle } from '@/db/schema';

function makeAisle(overrides: Partial<Aisle> = {}): Aisle {
  return {
    id: 'aisle-1',
    store_id: 'store-1',
    number: '3',
    label: 'Dairy',
    sort_order: 3,
    ...overrides,
  };
}

function renderSortable(aisle: Aisle) {
  return render(
    <DndContext>
      <SortableContext items={[aisle.id]}>
        <SortableAisleCard aisle={aisle} />
      </SortableContext>
    </DndContext>,
  );
}

describe('SortableAisleCard', () => {
  it('renders the underlying aisle label and badge', () => {
    renderSortable(makeAisle());
    expect(screen.getByText('Dairy')).toBeInTheDocument();
    expect(screen.getByText('Aisle 3')).toBeInTheDocument();
  });

  it('exposes an accessible reorder handle named after the aisle', () => {
    renderSortable(makeAisle({ label: 'Produce' }));
    expect(screen.getByRole('button', { name: 'Reorder Produce' })).toBeInTheDocument();
  });
});
