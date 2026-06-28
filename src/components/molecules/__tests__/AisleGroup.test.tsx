import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AisleGroup from '@/components/molecules/AisleGroup';

describe('AisleGroup', () => {
  it('renders the pre-formatted header', () => {
    render(<AisleGroup header="Dairy & Eggs" marker="1"><li>Milk</li></AisleGroup>);
    expect(screen.getByText('Dairy & Eggs')).toBeInTheDocument();
  });

  it('renders children inside a list', () => {
    render(
      <AisleGroup header="Bread" marker="21">
        <li>Hot dog rolls</li>
        <li>White bread</li>
      </AisleGroup>,
    );
    expect(screen.getByText('Hot dog rolls')).toBeInTheDocument();
    expect(screen.getByText('White bread')).toBeInTheDocument();
  });

  it('renders an aisle placard carrying the marker number for a numbered aisle', () => {
    render(<AisleGroup header="Produce" marker="3"><li>Apples</li></AisleGroup>);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders no placard when there is no marker (named section)', () => {
    const { container } = render(
      <AisleGroup header="Uncategorized" variant="muted"><li>Mystery</li></AisleGroup>,
    );
    // No filled placard tile and no leftover spine/station rail.
    expect(container.querySelector('.bg-primary')).toBeNull();
    expect(container.querySelector('.rounded-full')).toBeNull();
  });

  it('done variant shows a check chip instead of a number placard', () => {
    const { container } = render(
      <AisleGroup header="Done · 2" variant="done"><li>Milk</li></AisleGroup>,
    );
    // A quiet tint chip, not a filled primary number placard.
    expect(container.querySelector('.bg-tint')).not.toBeNull();
    expect(screen.getByText('Done · 2')).toBeInTheDocument();
  });
});
