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

  it('heads a numbered aisle inline with no filled number placard (ADR-0023)', () => {
    const { container } = render(
      <AisleGroup header="Aisle 3 — Produce"><li>Apples</li></AisleGroup>,
    );
    // The number lives in the inline label, not a filled bg-primary tile.
    expect(screen.getByText('Aisle 3 — Produce')).toBeInTheDocument();
    expect(container.querySelector('.bg-primary')).toBeNull();
  });

  it('renders no placard for a named section', () => {
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
