import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AisleGroup from '@/components/molecules/AisleGroup';

describe('AisleGroup', () => {
  it('renders header with aisle number and label', () => {
    render(<AisleGroup label="Dairy & Eggs" number="1"><li>Milk</li></AisleGroup>);
    expect(screen.getByText('Aisle 1 — Dairy & Eggs')).toBeInTheDocument();
  });

  it('renders header with label only when number is omitted', () => {
    render(<AisleGroup label="Uncategorized"><li>Item</li></AisleGroup>);
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('renders children inside a list', () => {
    render(
      <AisleGroup label="Bread" number="21">
        <li>Hot dog rolls</li>
        <li>White bread</li>
      </AisleGroup>,
    );
    expect(screen.getByText('Hot dog rolls')).toBeInTheDocument();
    expect(screen.getByText('White bread')).toBeInTheDocument();
  });
});
