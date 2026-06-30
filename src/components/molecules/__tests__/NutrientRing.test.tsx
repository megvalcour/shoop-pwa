import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import NutrientRing from '@/components/molecules/NutrientRing';

function arc(container: HTMLElement): SVGCircleElement {
  // The second circle is the value arc (first is the track).
  const circles = container.querySelectorAll('circle');
  return circles[1] as unknown as SVGCircleElement;
}

describe('NutrientRing', () => {
  it('renders a 0% ring with the arc fully offset (no fill)', () => {
    const { container } = render(
      <NutrientRing label="Protein" value={0} target={120} unit="g" pct={0} tone="low" />,
    );
    const valueArc = arc(container);
    const circumference = Number(valueArc.getAttribute('stroke-dasharray'));
    // 0% → dashoffset equals the full circumference.
    expect(Number(valueArc.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference, 5);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders a partial ring with a proportional arc offset', () => {
    const { container } = render(
      <NutrientRing label="Protein" value={82} target={120} unit="g" pct={82 / 120} tone="low" />,
    );
    const valueArc = arc(container);
    const circumference = Number(valueArc.getAttribute('stroke-dasharray'));
    const offset = Number(valueArc.getAttribute('stroke-dashoffset'));
    expect(offset).toBeCloseTo(circumference * (1 - 82 / 120), 5);
    expect(screen.getByText('68%')).toBeInTheDocument();
  });

  it('clamps an over-100% ring to a full arc but shows the true percent', () => {
    const { container } = render(
      <NutrientRing label="Sodium" value={3450} target={2300} unit="mg" pct={1.5} tone="high" />,
    );
    const valueArc = arc(container);
    // Fully filled: dashoffset 0.
    expect(Number(valueArc.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5);
    expect(screen.getByText('150%')).toBeInTheDocument();
  });

  it('exposes an aria-label with value, target, and percent (color not the sole signal)', () => {
    render(<NutrientRing label="Protein" value={82} target={120} unit="g" pct={82 / 120} tone="low" />);
    expect(
      screen.getByRole('img', { name: 'Protein: 82 of 120 g, 68% of target' }),
    ).toBeInTheDocument();
    // The value/target readout is visible text too.
    expect(screen.getByText('82 / 120 g')).toBeInTheDocument();
  });

  it('only animates the arc fill under motion-safe (reduced-motion honored)', () => {
    const { container } = render(
      <NutrientRing label="Fiber" value={15} target={30} unit="g" pct={0.5} tone="low" />,
    );
    expect(arc(container).getAttribute('class')).toContain('motion-safe:transition-[stroke-dashoffset]');
  });
});
