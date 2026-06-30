import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import EatRoute from '@/routes/EatRoute';

describe('EatRoute', () => {
  it('renders the intro heading and the three coming-soon sections', () => {
    render(<EatRoute />);
    expect(screen.getByRole('heading', { name: /plan your week/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /recipes/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /weekly plan/i })).toBeInTheDocument();
  });

  it('marks the stub sections as coming soon', () => {
    render(<EatRoute />);
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(3);
  });
});
