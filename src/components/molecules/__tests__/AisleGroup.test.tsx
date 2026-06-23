import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AisleGroup from '@/components/molecules/AisleGroup';

describe('AisleGroup', () => {
  it('renders the pre-formatted header', () => {
    render(<AisleGroup header="Aisle 1 — Dairy & Eggs"><li>Milk</li></AisleGroup>);
    expect(screen.getByText('Aisle 1 — Dairy & Eggs')).toBeInTheDocument();
  });

  it('renders children inside a list', () => {
    render(
      <AisleGroup header="Aisle 21 — Bread">
        <li>Hot dog rolls</li>
        <li>White bread</li>
      </AisleGroup>,
    );
    expect(screen.getByText('Hot dog rolls')).toBeInTheDocument();
    expect(screen.getByText('White bread')).toBeInTheDocument();
  });
});
