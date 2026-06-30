import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import EatRoute from '@/routes/EatRoute';

describe('EatRoute', () => {
  it('renders the intro heading and three placeholder sections', () => {
    render(<EatRoute />);
    expect(screen.getByRole('heading', { name: /plan your week/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Profile$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Recipes$/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Weekly Plan$/ })).toBeInTheDocument();
  });

  it('marks the placeholder sections as coming soon', () => {
    render(<EatRoute />);
    expect(screen.getAllByText(/coming soon/i)).toHaveLength(3);
  });
});
