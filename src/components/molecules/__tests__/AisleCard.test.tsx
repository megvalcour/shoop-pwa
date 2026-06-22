import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AisleCard from '@/components/molecules/AisleCard';
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

describe('AisleCard', () => {
  it('renders the aisle label', () => {
    render(<AisleCard aisle={makeAisle()} />);
    expect(screen.getByText('Dairy')).toBeInTheDocument();
  });

  it('renders an "Aisle N" badge when number is present', () => {
    render(<AisleCard aisle={makeAisle({ number: '3' })} />);
    expect(screen.getByText('Aisle 3')).toBeInTheDocument();
    expect(screen.queryByText('Section')).not.toBeInTheDocument();
  });

  it('renders a "Section" badge for a special section with no number', () => {
    render(<AisleCard aisle={makeAisle({ number: '', label: 'Produce' })} />);
    expect(screen.getByText('Section')).toBeInTheDocument();
    expect(screen.queryByText(/Aisle/)).not.toBeInTheDocument();
  });

  it('renders no handle by default', () => {
    render(<AisleCard aisle={makeAisle()} />);
    expect(screen.queryByTestId('aisle-handle')).not.toBeInTheDocument();
  });

  it('renders the handle node when provided', () => {
    render(
      <AisleCard
        aisle={makeAisle()}
        handle={<span data-testid="aisle-handle">grip</span>}
      />,
    );
    expect(screen.getByTestId('aisle-handle')).toBeInTheDocument();
  });
});
