import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AisleGroup from '@/components/molecules/AisleGroup';

const DEFAULT_PROPS = { color: '#2563eb', tint: '#e8eefc', count: 2 };

describe('AisleGroup', () => {
  it('renders label text', () => {
    render(
      <AisleGroup label="Dairy & Eggs" number="1" {...DEFAULT_PROPS}>
        <li>Milk</li>
      </AisleGroup>,
    );
    expect(screen.getByText('Dairy & Eggs')).toBeInTheDocument();
  });

  it('renders label when number is omitted', () => {
    render(
      <AisleGroup label="Uncategorized" {...DEFAULT_PROPS}>
        <li>Item</li>
      </AisleGroup>,
    );
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('renders the count badge', () => {
    render(
      <AisleGroup label="Bread" number="21" {...DEFAULT_PROPS} count={3}>
        <li>Hot dog rolls</li>
      </AisleGroup>,
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(
      <AisleGroup label="Bread" number="21" {...DEFAULT_PROPS}>
        <li>Hot dog rolls</li>
        <li>White bread</li>
      </AisleGroup>,
    );
    expect(screen.getByText('Hot dog rolls')).toBeInTheDocument();
    expect(screen.getByText('White bread')).toBeInTheDocument();
  });
});
